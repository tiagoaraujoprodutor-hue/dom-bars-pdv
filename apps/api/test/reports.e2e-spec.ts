import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PaymentMethod, Role } from '@prisma/client';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const PASSWORD = 'senha123';
const ADMIN_PASSWORD = 'admin777';

function binaryParser(res: request.Response, cb: (err: Error | null, body: Buffer) => void): void {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
}

describe('Relatórios PDF e fechamento de evento (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const companyId = 'rep-company';
  const eventId = 'rep-event';
  const PROD = 'rep-prod';
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
    await prisma.company.create({ data: { id: companyId, name: 'Empresa Rel' } });
    await prisma.event.create({
      data: {
        id: eventId,
        companyId,
        name: 'Evento Rel',
        adminPasswordHash: await argon2.hash(ADMIN_PASSWORD),
      },
    });
    for (const [id, email, role] of [
      ['rep-admin', 'admin@rep.com', Role.ADMINISTRADOR],
      ['rep-oper', 'oper@rep.com', Role.OPERADOR],
    ] as const) {
      await prisma.user.create({ data: { id, companyId, name: email, email, passwordHash } });
      await prisma.eventMembership.create({ data: { userId: id, eventId, role } });
    }
    await prisma.product.create({
      data: { id: PROD, eventId, name: 'Refri', price: '8.00', stock: 100 },
    });

    adminToken = await login('admin@rep.com');
    operToken = await login('oper@rep.com');

    // Movimenta o evento: abre caixa e vende.
    const reg = await request(app.getHttpServer())
      .post(`/events/${eventId}/cash-registers/open`)
      .set(auth(adminToken))
      .send({ openingAmount: '50.00' });
    registerId = reg.body.id;

    await request(app.getHttpServer())
      .post(`/events/${eventId}/sales`)
      .set(auth(operToken))
      .send({
        clientId: randomUUID(),
        items: [{ productId: PROD, quantity: 3 }],
        payments: [{ method: PaymentMethod.DINHEIRO, amount: '24.00' }],
      });
  });

  afterAll(async () => {
    await app.close();
  });

  function login(email: string): Promise<string> {
    return request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: PASSWORD })
      .then((r) => r.body.accessToken as string);
  }
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  const reportPaths = [
    'general',
    'sales-by-operator',
    'sales-by-machine',
    'sales-by-product',
    'payments',
    'courtesies',
    'refunds',
    'cash-movements',
    'losses',
    'stock',
  ];

  it.each(reportPaths)('gera o relatório %s em PDF', async (path) => {
    const res = await request(app.getHttpServer())
      .get(`/events/${eventId}/reports/${path}`)
      .set(auth(adminToken))
      .buffer()
      .parse(binaryParser);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect((res.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
  });

  it('gera o fechamento de caixa em PDF', async () => {
    const res = await request(app.getHttpServer())
      .get(`/events/${eventId}/reports/cash/${registerId}`)
      .set(auth(adminToken))
      .buffer()
      .parse(binaryParser);
    expect(res.status).toBe(200);
    expect((res.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
  });

  it('operador não acessa relatórios (RBAC)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/events/${eventId}/reports/general`)
      .set(auth(operToken));
    expect(res.status).toBe(403);
  });

  it('fechamento do evento exige senha admin', async () => {
    const bad = await request(app.getHttpServer())
      .post(`/events/${eventId}/close`)
      .set(auth(adminToken))
      .send({ adminPassword: 'errada' });
    expect(bad.status).toBe(403);
  });

  it('fecha o evento, consolida e audita', async () => {
    const res = await request(app.getHttpServer())
      .post(`/events/${eventId}/close`)
      .set(auth(adminToken))
      .send({ adminPassword: ADMIN_PASSWORD });
    expect(res.status).toBe(201);
    expect(res.body.evento.status).toBe('ENCERRADO');
    expect(res.body.consolidacao.totalVendas).toBe(1);

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'EVENT_CLOSE', eventId },
    });
    expect(audit).not.toBeNull();

    // Fechar de novo deve falhar.
    const again = await request(app.getHttpServer())
      .post(`/events/${eventId}/close`)
      .set(auth(adminToken))
      .send({ adminPassword: ADMIN_PASSWORD });
    expect(again.status).toBe(409);
  });
});
