import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PaymentMethod, Role } from '@prisma/client';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const PASSWORD = 'senha123';
const ADMIN_PASSWORD = 'admin999';

describe('Núcleo operacional — ciclo de venda (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const companyId = 's-company';
  const eventId = 's-event';
  const AGUA = 's-prod-agua';
  const CAIPI = 's-prod-caipi';
  const VODKA = 's-ing-vodka';
  const LIMAO = 's-ing-limao';

  let adminToken: string;
  let operToken: string;
  let registerId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);

    await prisma.$executeRawUnsafe(
      'TRUNCATE "AuditLog","RefreshToken","EventMembership","RecipeItem","Ingredient","Product","Category","Courtesy","Refund","Payment","SaleItem","Sale","TabItem","Tab","CashMovement","CashRegister","LossRecord","Event","User","Company" RESTART IDENTITY CASCADE',
    );

    const passwordHash = await argon2.hash(PASSWORD);
    await prisma.company.create({ data: { id: companyId, name: 'Empresa Vendas' } });
    await prisma.event.create({
      data: {
        id: eventId,
        companyId,
        name: 'Evento Vendas',
        adminPasswordHash: await argon2.hash(ADMIN_PASSWORD),
        serviceFeeEnabled: true,
        serviceFeePercent: '10.00',
      },
    });

    for (const [id, email, role] of [
      ['s-admin', 'admin@s.com', Role.ADMINISTRADOR],
      ['s-oper', 'oper@s.com', Role.OPERADOR],
    ] as const) {
      await prisma.user.create({
        data: { id, companyId, name: email, email, passwordHash },
      });
      await prisma.eventMembership.create({ data: { userId: id, eventId, role } });
    }

    // Água: sem ficha técnica → baixa o próprio estoque.
    await prisma.product.create({
      data: { id: AGUA, eventId, name: 'Água', price: '10.00', stock: 50 },
    });
    // Caipirinha: ficha técnica → baixa insumos.
    await prisma.product.create({
      data: { id: CAIPI, eventId, name: 'Caipirinha', price: '20.00', stock: 100 },
    });
    await prisma.ingredient.create({
      data: { id: VODKA, eventId, name: 'Vodka', unit: 'ml', stock: '1000' },
    });
    await prisma.ingredient.create({
      data: { id: LIMAO, eventId, name: 'Limão', unit: 'un', stock: '100' },
    });
    await prisma.recipeItem.createMany({
      data: [
        { productId: CAIPI, ingredientId: VODKA, quantity: '50' },
        { productId: CAIPI, ingredientId: LIMAO, quantity: '1' },
      ],
    });

    adminToken = await tokenFor('admin@s.com');
    operToken = await tokenFor('oper@s.com');
  });

  afterAll(async () => {
    await app.close();
  });

  function tokenFor(email: string): Promise<string> {
    return request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: PASSWORD })
      .then((r) => r.body.accessToken as string);
  }

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  it('bloqueia venda sem caixa aberto', async () => {
    const res = await request(app.getHttpServer())
      .post(`/events/${eventId}/sales`)
      .set(auth(operToken))
      .send({
        clientId: randomUUID(),
        items: [{ productId: AGUA, quantity: 1 }],
        payments: [{ method: PaymentMethod.DINHEIRO, amount: '10.00' }],
      });
    expect(res.status).toBe(409);
  });

  it('o atendente abre o próprio caixa', async () => {
    const res = await request(app.getHttpServer())
      .post(`/events/${eventId}/cash-registers/open`)
      .set(auth(operToken))
      .send({ openingAmount: '100.00' });
    expect(res.status).toBe(201);
    registerId = res.body.id;
  });

  it('vende produto simples e baixa o estoque', async () => {
    const res = await request(app.getHttpServer())
      .post(`/events/${eventId}/sales`)
      .set(auth(operToken))
      .send({
        clientId: randomUUID(),
        items: [{ productId: AGUA, quantity: 2 }],
        payments: [{ method: PaymentMethod.DINHEIRO, amount: '20.00' }],
      });
    expect(res.status).toBe(201);
    expect(res.body.total).toBe('20');

    const agua = await prisma.product.findUniqueOrThrow({ where: { id: AGUA } });
    expect(agua.stock).toBe(48);

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'SALE_CREATE', entityId: res.body.id },
    });
    expect(audit).not.toBeNull();
  });

  it('cortesia como forma de pagamento exige a senha administrativa', async () => {
    const base = {
      items: [{ productId: AGUA, quantity: 1 }],
      payments: [{ method: PaymentMethod.CORTESIA, amount: '10.00' }],
    };

    // Sem senha admin → recusa.
    const semSenha = await request(app.getHttpServer())
      .post(`/events/${eventId}/sales`)
      .set(auth(operToken))
      .send({ clientId: randomUUID(), ...base });
    expect(semSenha.status).toBe(400);

    // Senha errada → 403.
    const errada = await request(app.getHttpServer())
      .post(`/events/${eventId}/sales`)
      .set(auth(operToken))
      .send({ clientId: randomUUID(), ...base, adminPassword: 'errada' });
    expect(errada.status).toBe(403);

    // Senha correta → registra a venda como cortesia.
    const ok = await request(app.getHttpServer())
      .post(`/events/${eventId}/sales`)
      .set(auth(operToken))
      .send({ clientId: randomUUID(), ...base, adminPassword: ADMIN_PASSWORD });
    expect(ok.status).toBe(201);
    expect(ok.body.payments[0].method).toBe(PaymentMethod.CORTESIA);
  });

  it('vende produto com ficha técnica e baixa os insumos', async () => {
    const res = await request(app.getHttpServer())
      .post(`/events/${eventId}/sales`)
      .set(auth(operToken))
      .send({
        clientId: randomUUID(),
        items: [{ productId: CAIPI, quantity: 2 }],
        payments: [{ method: PaymentMethod.PIX, amount: '40.00' }],
      });
    expect(res.status).toBe(201);

    const vodka = await prisma.ingredient.findUniqueOrThrow({ where: { id: VODKA } });
    const limao = await prisma.ingredient.findUniqueOrThrow({ where: { id: LIMAO } });
    expect(vodka.stock.toString()).toBe('900'); // 1000 - 2*50
    expect(limao.stock.toString()).toBe('98'); // 100 - 2*1
  });

  it('rejeita pagamento que não fecha com o total', async () => {
    const res = await request(app.getHttpServer())
      .post(`/events/${eventId}/sales`)
      .set(auth(operToken))
      .send({
        clientId: randomUUID(),
        items: [{ productId: AGUA, quantity: 1 }],
        payments: [{ method: PaymentMethod.DINHEIRO, amount: '5.00' }],
      });
    expect(res.status).toBe(400);
  });

  it('é idempotente por clientId (venda offline não duplica)', async () => {
    const clientId = randomUUID();
    const body = {
      clientId,
      items: [{ productId: AGUA, quantity: 1 }],
      payments: [{ method: PaymentMethod.DINHEIRO, amount: '10.00' }],
    };
    const first = await request(app.getHttpServer())
      .post(`/events/${eventId}/sales`)
      .set(auth(operToken))
      .send(body);
    const second = await request(app.getHttpServer())
      .post(`/events/${eventId}/sales`)
      .set(auth(operToken))
      .send(body);

    expect(first.body.id).toBe(second.body.id);
    const count = await prisma.sale.count({ where: { eventId, clientId } });
    expect(count).toBe(1);
  });

  it('aplica taxa de serviço no fechamento da comanda', async () => {
    const tab = await request(app.getHttpServer())
      .post(`/events/${eventId}/tabs`)
      .set(auth(operToken))
      .send({});
    expect(tab.status).toBe(201);

    await request(app.getHttpServer())
      .post(`/events/${eventId}/tabs/${tab.body.id}/items`)
      .set(auth(operToken))
      .send({ items: [{ productId: AGUA, quantity: 1 }] })
      .expect(201);

    const close = await request(app.getHttpServer())
      .post(`/events/${eventId}/tabs/${tab.body.id}/close`)
      .set(auth(operToken))
      .send({
        clientId: randomUUID(),
        payments: [{ method: PaymentMethod.PIX, amount: '11.00' }], // 10 + 10%
      });
    expect(close.status).toBe(201);
    expect(close.body.serviceFee).toBe('1');
    expect(close.body.total).toBe('11');

    const reloaded = await prisma.tab.findUniqueOrThrow({ where: { id: tab.body.id } });
    expect(reloaded.status).toBe('FECHADA');
  });

  it('aba de pedidos: lista gerenciada e reimpressão registrada (senha admin)', async () => {
    const venda = await request(app.getHttpServer())
      .post(`/events/${eventId}/sales`)
      .set(auth(operToken))
      .send({
        clientId: randomUUID(),
        items: [{ productId: AGUA, quantity: 1 }],
        payments: [{ method: PaymentMethod.PIX, amount: '10.00' }],
      });
    expect(venda.status).toBe(201);
    const saleId = venda.body.id as string;

    // Sem a senha admin correta → barra o acesso à aba.
    const semSenha = await request(app.getHttpServer())
      .post(`/events/${eventId}/sales/manage`)
      .set(auth(operToken))
      .send({ adminPassword: 'errada' });
    expect(semSenha.status).toBe(403);

    // Com a senha → lista com nome do atendente, itens e reimpressões.
    const lista = await request(app.getHttpServer())
      .post(`/events/${eventId}/sales/manage`)
      .set(auth(operToken))
      .send({ adminPassword: ADMIN_PASSWORD });
    expect(lista.status).toBe(201);
    const pedido = (lista.body as { id: string; operatorName: string; reprintCount: number; items: { name: string }[] }[]).find(
      (p) => p.id === saleId,
    );
    expect(pedido?.operatorName).toBeTruthy();
    expect(pedido?.items[0]?.name).toBeTruthy();
    expect(pedido?.reprintCount).toBe(0);

    // Reimprime → conta sobe e registra auditoria.
    const rep = await request(app.getHttpServer())
      .post(`/events/${eventId}/sales/${saleId}/reprint`)
      .set(auth(operToken))
      .send({ adminPassword: ADMIN_PASSWORD });
    expect(rep.status).toBe(201);
    expect(rep.body.reprintCount).toBe(1);

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'SALE_REPRINT', entityId: saleId },
    });
    expect(audit).not.toBeNull();
  });

  it('cancela venda (admin + senha admin) e estorna estoque', async () => {
    const clientId = randomUUID();
    const sale = await request(app.getHttpServer())
      .post(`/events/${eventId}/sales`)
      .set(auth(operToken))
      .send({
        clientId,
        items: [{ productId: AGUA, quantity: 3 }],
        payments: [{ method: PaymentMethod.DINHEIRO, amount: '30.00' }],
      });
    const before = await prisma.product.findUniqueOrThrow({ where: { id: AGUA } });

    const cancel = await request(app.getHttpServer())
      .post(`/events/${eventId}/sales/${sale.body.id}/cancel`)
      .set(auth(adminToken))
      .send({ adminPassword: ADMIN_PASSWORD, reason: 'cliente desistiu' });
    expect(cancel.status).toBe(201);
    expect(cancel.body.status).toBe('CANCELADA');

    const after = await prisma.product.findUniqueOrThrow({ where: { id: AGUA } });
    expect(after.stock).toBe(before.stock + 3);

    const refund = await prisma.refund.findUnique({ where: { saleId: sale.body.id } });
    expect(refund).not.toBeNull();
  });

  it('cancelamento exige a senha admin (senha errada é barrada)', async () => {
    const sale = await prisma.sale.findFirst({ where: { eventId, status: 'CONCLUIDA' } });
    // Senha errada → barrado (independente do cargo).
    const errada = await request(app.getHttpServer())
      .post(`/events/${eventId}/sales/${sale?.id}/cancel`)
      .set(auth(operToken))
      .send({ adminPassword: 'errada', reason: 'tentativa' });
    expect(errada.status).toBe(403);

    // Senha correta → o admin autoriza na máquina da atendente (operador) → cancela.
    const ok = await request(app.getHttpServer())
      .post(`/events/${eventId}/sales/${sale?.id}/cancel`)
      .set(auth(operToken))
      .send({ adminPassword: ADMIN_PASSWORD, reason: 'autorizado pelo admin' });
    expect(ok.status).toBe(201);
  });

  it('cortesia exige senha admin e gera auditoria', async () => {
    const bad = await request(app.getHttpServer())
      .post(`/events/${eventId}/courtesies`)
      .set(auth(adminToken))
      .send({ beneficiary: 'VIP', reason: 'parceria', amount: '15.00', adminPassword: 'errada' });
    expect(bad.status).toBe(403);

    const ok = await request(app.getHttpServer())
      .post(`/events/${eventId}/courtesies`)
      .set(auth(adminToken))
      .send({
        beneficiary: 'VIP',
        reason: 'parceria',
        amount: '15.00',
        adminPassword: ADMIN_PASSWORD,
      });
    expect(ok.status).toBe(201);

    const audit = await prisma.auditLog.findFirst({ where: { action: 'COURTESY_GRANT' } });
    expect(audit).not.toBeNull();
  });

  it('sangria exige senha admin', async () => {
    const bad = await request(app.getHttpServer())
      .post(`/events/${eventId}/cash-registers/${registerId}/sangria`)
      .set(auth(adminToken))
      .send({ amount: '10.00', reason: 'troco', adminPassword: 'errada' });
    expect(bad.status).toBe(403);

    const ok = await request(app.getHttpServer())
      .post(`/events/${eventId}/cash-registers/${registerId}/sangria`)
      .set(auth(adminToken))
      .send({ amount: '10.00', reason: 'troco', adminPassword: ADMIN_PASSWORD });
    expect(ok.status).toBe(201);
  });

  it('registra perda de insumo e baixa o estoque', async () => {
    const before = await prisma.ingredient.findUniqueOrThrow({ where: { id: LIMAO } });
    const res = await request(app.getHttpServer())
      .post(`/events/${eventId}/losses`)
      .set(auth(adminToken))
      .send({
        type: 'QUEBRA',
        ingredientId: LIMAO,
        quantity: '5',
        reason: 'caiu no chão',
        adminPassword: ADMIN_PASSWORD,
      });
    expect(res.status).toBe(201);

    const after = await prisma.ingredient.findUniqueOrThrow({ where: { id: LIMAO } });
    expect(Number(after.stock) - Number(before.stock)).toBe(-5);
  });

  it('fechamento concorrente da MESMA comanda não cobra em dobro', async () => {
    // Duas máquinas fecham a mesma comanda ao mesmo tempo (clientIds diferentes,
    // então a idempotência por clientId NÃO cobre este caso). O fecho condicional
    // da comanda garante que só uma venda seja criada.
    const tab = await request(app.getHttpServer())
      .post(`/events/${eventId}/tabs`)
      .set(auth(operToken))
      .send({});
    expect(tab.status).toBe(201);
    const tabId = tab.body.id as string;

    await request(app.getHttpServer())
      .post(`/events/${eventId}/tabs/${tabId}/items`)
      .set(auth(operToken))
      .send({ items: [{ productId: AGUA, quantity: 1 }] })
      .expect(201);

    const close = (clientId: string) =>
      request(app.getHttpServer())
        .post(`/events/${eventId}/tabs/${tabId}/close`)
        .set(auth(operToken))
        .send({ clientId, payments: [{ method: PaymentMethod.PIX, amount: '11.00' }] });

    const [a, b] = await Promise.all([close(randomUUID()), close(randomUUID())]);
    const statuses = [a.status, b.status].sort();
    // Exatamente um 201 (criou a venda) e um 409 (comanda já fechada).
    expect(statuses).toEqual([201, 409]);

    // E há SÓ UMA venda associada à comanda (não houve cobrança em dobro).
    const sales = await prisma.sale.count({ where: { tabId } });
    expect(sales).toBe(1);

    const reloaded = await prisma.tab.findUniqueOrThrow({ where: { id: tabId } });
    expect(reloaded.status).toBe('FECHADA');
  });

  it('valor monetário inválido vira 400 (não 500)', async () => {
    // Texto não numérico não pode estourar o Decimal lá dentro (antes: 500).
    const naoNumerico = await request(app.getHttpServer())
      .post(`/events/${eventId}/sales`)
      .set(auth(operToken))
      .send({
        clientId: randomUUID(),
        items: [{ productId: AGUA, quantity: 1 }],
        payments: [{ method: PaymentMethod.DINHEIRO, amount: 'abc' }],
      });
    expect(naoNumerico.status).toBe(400);

    // Valor negativo também é barrado na fronteira.
    const negativo = await request(app.getHttpServer())
      .post(`/events/${eventId}/sales`)
      .set(auth(operToken))
      .send({
        clientId: randomUUID(),
        items: [{ productId: AGUA, quantity: 1 }],
        payments: [{ method: PaymentMethod.DINHEIRO, amount: '-10.00' }],
      });
    expect(negativo.status).toBe(400);
  });

  it('reusar clientId com conteúdo diferente é recusado (409)', async () => {
    const clientId = randomUUID();
    const first = await request(app.getHttpServer())
      .post(`/events/${eventId}/sales`)
      .set(auth(operToken))
      .send({
        clientId,
        items: [{ productId: AGUA, quantity: 1 }],
        payments: [{ method: PaymentMethod.DINHEIRO, amount: '10.00' }],
      });
    expect(first.status).toBe(201);

    // Mesmo clientId, itens DIFERENTES → 409 (não colapsa duas entregas em uma).
    const diverge = await request(app.getHttpServer())
      .post(`/events/${eventId}/sales`)
      .set(auth(operToken))
      .send({
        clientId,
        items: [{ productId: AGUA, quantity: 5 }],
        payments: [{ method: PaymentMethod.DINHEIRO, amount: '50.00' }],
      });
    expect(diverge.status).toBe(409);

    // Mesmo clientId, MESMO conteúdo → idempotente (devolve a venda original).
    const igual = await request(app.getHttpServer())
      .post(`/events/${eventId}/sales`)
      .set(auth(operToken))
      .send({
        clientId,
        items: [{ productId: AGUA, quantity: 1 }],
        payments: [{ method: PaymentMethod.DINHEIRO, amount: '10.00' }],
      });
    expect(igual.status).toBe(201);
    expect(igual.body.id).toBe(first.body.id);
  });

  it('registro de perda exige a senha administrativa', async () => {
    // Sem a senha → 400 (obrigatória no schema).
    const semSenha = await request(app.getHttpServer())
      .post(`/events/${eventId}/losses`)
      .set(auth(adminToken))
      .send({ type: 'QUEBRA', ingredientId: LIMAO, quantity: '1', reason: 'sem senha' });
    expect(semSenha.status).toBe(400);

    // Senha errada → 403.
    const errada = await request(app.getHttpServer())
      .post(`/events/${eventId}/losses`)
      .set(auth(adminToken))
      .send({
        type: 'QUEBRA',
        ingredientId: LIMAO,
        quantity: '1',
        reason: 'senha errada',
        adminPassword: 'errada',
      });
    expect(errada.status).toBe(403);
  });

  // DEVE SER O ÚLTIMO teste: dispara o bloqueio da senha admin do evento.
  it('senha admin: bloqueia após tentativas repetidas (antifraude força-bruta)', async () => {
    let bloqueou = false;
    for (let i = 0; i < 8; i++) {
      const r = await request(app.getHttpServer())
        .post(`/events/${eventId}/sales/manage`)
        .set(auth(operToken))
        .send({ adminPassword: 'forca-bruta' });
      if (r.status === 429) bloqueou = true;
    }
    // Depois de poucas tentativas erradas seguidas, passa a responder 429 (bloqueio).
    expect(bloqueou).toBe(true);
  });
});
