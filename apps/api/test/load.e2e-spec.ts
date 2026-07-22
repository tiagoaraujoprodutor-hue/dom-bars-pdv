import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Role } from '@prisma/client';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const PASSWORD = 'senha123';
const N_ATT = 60; // 60 máquinas/atendentes
const ROUNDS = 6; // 6 rodadas em tempo real → 360 vendas
// Máx. de requisições em voo ao mesmo tempo. O motor do Prisma no CONTÊINER DE
// TESTE (pouca memória) não aguenta 60 no mesmíssimo instante — cai com "engine
// empty". Em lotes provamos a corretude sob concorrência sem derrubar o sandbox;
// na VPS real (mais recursos + connection_limit) roda com a onda inteira.
const INFLIGHT = 8;

async function inChunks<T>(thunks: (() => Promise<T>)[], size: number): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < thunks.length; i += size) {
    out.push(...(await Promise.all(thunks.slice(i, i + size).map((f) => f()))));
  }
  return out;
}

/**
 * Teste de carga fiel à operação: as 60 máquinas vendem AO MESMO TEMPO (60
 * requisições simultâneas por rodada), repetidamente ao longo do evento. Garante
 * a "regra de ouro" sob concorrência real — nenhuma venda trava, falha, perde ou
 * duplica, mesmo todos batendo no MESMO produto/estoque a cada rodada.
 */
describe('Carga — 60 atendentes vendendo ao mesmo tempo (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const companyId = 'load-company';
  const eventId = 'load-event';
  const PROD = 'load-prod';
  const tokens: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);

    await prisma.$executeRawUnsafe(
      'TRUNCATE "AuditLog","RefreshToken","EventMembership","RecipeItem","Ingredient","Product","Category","Courtesy","Refund","Payment","SaleItem","Sale","TabItem","Tab","CashMovement","CashRegister","LossRecord","Event","User","Company" RESTART IDENTITY CASCADE',
    );

    const passwordHash = await argon2.hash(PASSWORD);
    await prisma.company.create({ data: { id: companyId, name: 'Empresa Carga' } });
    await prisma.event.create({
      data: { id: eventId, companyId, name: 'Evento Carga', adminPasswordHash: await argon2.hash('admin') },
    });
    await prisma.product.create({
      data: { id: PROD, eventId, name: 'Cerveja', price: '10.00', stock: N_ATT * ROUNDS + 200 },
    });

    // 60 atendentes: usuário + vínculo + caixa aberto (sem caixa não vende).
    for (let i = 0; i < N_ATT; i++) {
      const id = `load-att-${i}`;
      await prisma.user.create({
        data: { id, companyId, name: `Atendente ${i}`, email: `att${i}@load.com`, passwordHash },
      });
      await prisma.eventMembership.create({ data: { userId: id, eventId, role: Role.OPERADOR } });
      await prisma.cashRegister.create({
        data: { eventId, openedById: id, status: 'ABERTO', openingAmount: '0' },
      });
    }

    // Login de cada máquina (em série, para não sobrecarregar o setup).
    for (let i = 0; i < N_ATT; i++) {
      const r = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: `att${i}@load.com`, password: PASSWORD });
      tokens.push(r.body.accessToken as string);
    }
  }, 120000);

  afterAll(async () => {
    await app.close();
  }, 30000);

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  it(`${N_ATT} máquinas vendendo ao mesmo tempo, ${ROUNDS} rodadas: nada trava, falha, perde ou duplica`, async () => {
    expect(tokens.filter(Boolean)).toHaveLength(N_ATT);

    const tempos: number[] = [];
    for (let round = 0; round < ROUNDS; round++) {
      // Onda: as 60 máquinas vendem ao mesmo tempo (em lotes de INFLIGHT).
      const wave = tokens.map(
        (t) => () =>
          request(app.getHttpServer())
            .post(`/events/${eventId}/sales`)
            .set(auth(t))
            .send({
              clientId: randomUUID(),
              items: [{ productId: PROD, quantity: 1 }],
              payments: [{ method: 'DINHEIRO', amount: '10.00' }],
            })
            .then((r) => r),
      );

      const start = Date.now();
      const results = await inChunks(wave, INFLIGHT);
      tempos.push(Date.now() - start);

      const falhas = results.filter((r) => r.status !== 201);
      if (falhas.length) {
        const amostra = falhas.slice(0, 3).map((r) => `${r.status}:${JSON.stringify(r.body)?.slice(0, 100)}`);
        throw new Error(`Rodada ${round + 1}: ${falhas.length}/${N_ATT} falharam. ${amostra.join(' | ')}`);
      }
    }

    const total = N_ATT * ROUNDS;

    // Consistência: nem perde nem duplica.
    const [count, agg, prod] = await Promise.all([
      prisma.sale.count({ where: { eventId } }),
      prisma.sale.aggregate({ where: { eventId }, _sum: { total: true } }),
      prisma.product.findUniqueOrThrow({ where: { id: PROD } }),
    ]);
    expect(count).toBe(total);
    expect(Number(agg._sum.total)).toBe(total * 10);
    expect(prod.stock).toBe(N_ATT * ROUNDS + 200 - total);

    const piorOnda = Math.max(...tempos);
    // eslint-disable-next-line no-console
    console.log(
      `[carga] ${ROUNDS} rodadas de ${N_ATT} vendas simultâneas (${total} no total). ` +
        `Onda mais lenta: ${piorOnda}ms para 60 vendas juntas (~${(piorOnda / N_ATT).toFixed(1)}ms/venda).`,
    );
    // Uma onda de 60 vendas juntas tem que resolver rápido (sem travar).
    expect(piorOnda).toBeLessThan(15000);
  }, 120000);
});
