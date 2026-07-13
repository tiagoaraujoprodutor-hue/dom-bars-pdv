import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Role } from '@prisma/client';
import * as argon2 from 'argon2';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const PASSWORD = 'senha123';
const CPF_A = '11144477735'; // válido
const CPF_B = '52998224725'; // válido

describe('Atendentes — login por CPF + validade por evento (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const companyId = 'at-company';
  const eventId = 'at-event';
  let adminToken: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);

    await prisma.$executeRawUnsafe(
      'TRUNCATE "AuditLog","RefreshToken","EventMembership","RecipeItem","Ingredient","Product","Category","Courtesy","Refund","Payment","SaleItem","Sale","TabItem","Tab","CashMovement","CashRegister","LossRecord","Event","User","Company" RESTART IDENTITY CASCADE',
    );
    await prisma.company.create({ data: { id: companyId, name: 'Empresa At' } });
    await prisma.event.create({
      data: { id: eventId, companyId, name: 'Evento At', adminPasswordHash: await argon2.hash('x') },
    });
    await prisma.user.create({
      data: {
        id: 'at-admin',
        companyId,
        name: 'Admin',
        email: 'admin@at.com',
        passwordHash: await argon2.hash(PASSWORD),
      },
    });
    await prisma.eventMembership.create({
      data: { userId: 'at-admin', eventId, role: Role.ADMINISTRADOR },
    });

    adminToken = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@at.com', password: PASSWORD })
      .then((r) => r.body.accessToken as string);
  });

  afterAll(async () => {
    await app.close();
  });

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const loginCpf = (cpf: string, password: string) =>
    request(app.getHttpServer()).post('/auth/login').send({ cpf, password });

  it('admin cria atendente por CPF', async () => {
    const res = await request(app.getHttpServer())
      .post(`/events/${eventId}/attendants`)
      .set(auth(adminToken))
      .send({ name: 'Carla', cpf: '111.444.777-35', password: 'atende1', role: 'OPERADOR' });
    expect(res.status).toBe(201);
    expect(res.body.cpf).toBe(CPF_A);
  });

  it('rejeita CPF inválido', async () => {
    const res = await request(app.getHttpServer())
      .post(`/events/${eventId}/attendants`)
      .set(auth(adminToken))
      .send({ name: 'X', cpf: '11111111111', password: 'abcd' });
    expect(res.status).toBe(400);
  });

  it('atendente loga por CPF e recebe token', async () => {
    const res = await loginCpf(CPF_A, 'atende1');
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.user.memberships[0].eventId).toBe(eventId);
  });

  it('senha errada não loga', async () => {
    const res = await loginCpf(CPF_A, 'errada');
    expect(res.status).toBe(401);
  });

  it('operador não gerencia atendentes (RBAC)', async () => {
    const token = await loginCpf(CPF_A, 'atende1').then((r) => r.body.accessToken as string);
    const res = await request(app.getHttpServer())
      .get(`/events/${eventId}/attendants`)
      .set(auth(token));
    expect(res.status).toBe(403);
  });

  it('desativar bloqueia o acesso ao evento', async () => {
    const attendantId = (await prisma.user.findUniqueOrThrow({ where: { cpf: CPF_A } })).id;
    await request(app.getHttpServer())
      .patch(`/events/${eventId}/attendants/${attendantId}`)
      .set(auth(adminToken))
      .send({ active: false })
      .expect(200);

    // Login em si é barrado (403) por estar desativado.
    const login = await loginCpf(CPF_A, 'atende1');
    expect(login.status).toBe(403);

    // Reativa para os próximos testes.
    await request(app.getHttpServer())
      .patch(`/events/${eventId}/attendants/${attendantId}`)
      .set(auth(adminToken))
      .send({ active: true })
      .expect(200);
  });

  it('senha expirada bloqueia login e acesso', async () => {
    // cria outro atendente com validade no passado
    await request(app.getHttpServer())
      .post(`/events/${eventId}/attendants`)
      .set(auth(adminToken))
      .send({
        name: 'João',
        cpf: CPF_B,
        password: 'atende2',
        expiresAt: '2020-01-01T00:00:00.000Z',
      })
      .expect(201);

    const login = await loginCpf(CPF_B, 'atende2');
    expect(login.status).toBe(403); // expirado

    // Admin estende a validade → volta a logar.
    const id = (await prisma.user.findUniqueOrThrow({ where: { cpf: CPF_B } })).id;
    await request(app.getHttpServer())
      .patch(`/events/${eventId}/attendants/${id}`)
      .set(auth(adminToken))
      .send({ expiresAt: '2999-01-01T00:00:00.000Z' })
      .expect(200);

    const relogin = await loginCpf(CPF_B, 'atende2');
    expect(relogin.status).toBe(200);
  });
});
