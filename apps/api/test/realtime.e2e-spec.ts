import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PaymentMethod, Role } from '@prisma/client';
import * as argon2 from 'argon2';
import { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import { io, Socket } from 'socket.io-client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const PASSWORD = 'senha123';

function waitFor<T>(socket: Socket, event: string, timeoutMs = 4000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout esperando ${event}`)), timeoutMs);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

describe('Tempo real, dashboard e wizard (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let port: number;

  const companyId = 'r-company';
  const eventId = 'r-event';
  const PROD = 'r-prod';
  let adminToken: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    await app.listen(0);
    port = (app.getHttpServer().address() as AddressInfo).port;
    prisma = app.get(PrismaService);

    await prisma.$executeRawUnsafe(
      'TRUNCATE "AuditLog","RefreshToken","EventMembership","RecipeItem","Ingredient","Product","Category","Courtesy","Refund","Payment","SaleItem","Sale","TabItem","Tab","CashMovement","CashRegister","LossRecord","Event","User","Company" RESTART IDENTITY CASCADE',
    );

    const passwordHash = await argon2.hash(PASSWORD);
    await prisma.company.create({ data: { id: companyId, name: 'Empresa RT' } });
    await prisma.event.create({
      data: {
        id: eventId,
        companyId,
        name: 'Evento RT',
        adminPasswordHash: await argon2.hash('admin000'),
      },
    });
    await prisma.user.create({
      data: { id: 'r-admin', companyId, name: 'Admin RT', email: 'admin@r.com', passwordHash },
    });
    await prisma.eventMembership.create({
      data: { userId: 'r-admin', eventId, role: Role.ADMINISTRADOR },
    });
    await prisma.product.create({
      data: { id: PROD, eventId, name: 'Cerveja', price: '12.00', stock: 100 },
    });
    await prisma.cashRegister.create({
      data: { eventId, openedById: 'r-admin', openingAmount: '0' },
    });

    adminToken = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@r.com', password: PASSWORD })
      .then((r) => r.body.accessToken as string);
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /dashboard retorna faturamento bruto', async () => {
    const res = await request(app.getHttpServer())
      .get(`/events/${eventId}/dashboard`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.faturamentoBruto).toBe('0.00');
    expect(res.body).toHaveProperty('porFormaPagamento');
  });

  it('recusa conexão WS sem token válido', async () => {
    const socket = io(`http://localhost:${port}/events`, {
      auth: { token: 'invalido', eventId },
      transports: ['websocket'],
      reconnection: false,
    });
    const disconnected = new Promise<boolean>((resolve) => {
      socket.on('disconnect', () => resolve(true));
      socket.on('connected', () => resolve(false));
    });
    await expect(disconnected).resolves.toBe(true);
    socket.close();
  });

  it('emite dashboard:update em tempo real ao registrar venda', async () => {
    const socket = io(`http://localhost:${port}/events`, {
      auth: { token: adminToken, eventId },
      transports: ['websocket'],
      reconnection: false,
    });
    await waitFor(socket, 'connected');

    const updatePromise = waitFor<{ faturamentoBruto: string }>(socket, 'dashboard:update');

    await request(app.getHttpServer())
      .post(`/events/${eventId}/sales`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        clientId: randomUUID(),
        items: [{ productId: PROD, quantity: 1 }],
        payments: [{ method: PaymentMethod.DINHEIRO, amount: '12.00' }],
      })
      .expect(201);

    const update = await updatePromise;
    expect(update.faturamentoBruto).toBe('12.00');
    socket.close();
  });

  it('wizard: cria evento e usuário, e o novo usuário loga', async () => {
    // Usuário "dono" sem evento ainda.
    const ownerHash = await argon2.hash(PASSWORD);
    await prisma.user.create({
      data: { id: 'r-owner', companyId, name: 'Dono', email: 'dono@r.com', passwordHash: ownerHash },
    });
    const ownerToken = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'dono@r.com', password: PASSWORD })
      .then((r) => r.body.accessToken as string);

    const created = await request(app.getHttpServer())
      .post('/events')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: 'Festa Wizard',
        adminPassword: 'festa123',
        serviceFeeEnabled: true,
        serviceFeePercent: '10',
        products: [{ name: 'Drink', price: '15.00', stock: 30 }],
      });
    expect(created.status).toBe(201);
    const newEventId = created.body.id as string;

    // Criador é ADMINISTRADOR → consegue ver o dashboard do novo evento.
    const dash = await request(app.getHttpServer())
      .get(`/events/${newEventId}/dashboard`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(dash.status).toBe(200);

    // Cadastra um operador e ele loga.
    const newUser = await request(app.getHttpServer())
      .post(`/events/${newEventId}/users`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Op', email: 'op@wizard.com', password: 'segredo1', role: Role.OPERADOR });
    expect(newUser.status).toBe(201);

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'op@wizard.com', password: 'segredo1' });
    expect(login.status).toBe(200);
  });
});
