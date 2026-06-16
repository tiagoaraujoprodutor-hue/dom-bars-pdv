import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Role } from '@prisma/client';
import * as argon2 from 'argon2';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const PASSWORD = 'senha123';
const ADMIN_PASSWORD_A = 'adminA123';

describe('Auth + Multi-tenant + RBAC + Auditoria (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  // ids dos fixtures
  const companyId = 't-company';
  const eventA = 't-event-a';
  const eventB = 't-event-b';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);

    // TRUNCATE não dispara o trigger de auditoria (limpeza só de teste).
    await prisma.$executeRawUnsafe(
      'TRUNCATE "AuditLog","RefreshToken","EventMembership","RecipeItem","Ingredient","Product","Category","Courtesy","Refund","Payment","SaleItem","Sale","TabItem","Tab","CashMovement","CashRegister","LossRecord","Event","User","Company" RESTART IDENTITY CASCADE',
    );

    const passwordHash = await argon2.hash(PASSWORD);
    const adminPasswordHash = await argon2.hash(ADMIN_PASSWORD_A);

    await prisma.company.create({ data: { id: companyId, name: 'Empresa Teste' } });
    await prisma.event.createMany({
      data: [
        { id: eventA, companyId, name: 'Evento A', adminPasswordHash },
        { id: eventB, companyId, name: 'Evento B', adminPasswordHash: await argon2.hash('outra') },
      ],
    });

    const users: { id: string; email: string; role: Role; eventId: string }[] = [
      { id: 'u-oper', email: 'oper@a.com', role: Role.OPERADOR, eventId: eventA },
      { id: 'u-sup', email: 'sup@a.com', role: Role.SUPERVISOR, eventId: eventA },
      { id: 'u-admin', email: 'admin@a.com', role: Role.ADMINISTRADOR, eventId: eventA },
      { id: 'u-other', email: 'oper@b.com', role: Role.OPERADOR, eventId: eventB },
    ];
    for (const u of users) {
      await prisma.user.create({
        data: { id: u.id, companyId, name: u.email, email: u.email, passwordHash },
      });
      await prisma.eventMembership.create({
        data: { userId: u.id, eventId: u.eventId, role: u.role },
      });
    }
  });

  afterAll(async () => {
    await app.close();
  });

  function login(email: string, password = PASSWORD) {
    return request(app.getHttpServer()).post('/auth/login').send({ email, password });
  }

  async function token(email: string): Promise<string> {
    const res = await login(email);
    return res.body.accessToken as string;
  }

  describe('login dos 3 perfis', () => {
    it('operador, supervisor e admin logam e recebem tokens', async () => {
      for (const email of ['oper@a.com', 'sup@a.com', 'admin@a.com']) {
        const res = await login(email);
        expect(res.status).toBe(200);
        expect(res.body.accessToken).toEqual(expect.any(String));
        expect(res.body.refreshToken).toEqual(expect.any(String));
        expect(res.body.user.email).toBe(email);
      }
    });

    it('rejeita senha inválida', async () => {
      const res = await login('oper@a.com', 'errada');
      expect(res.status).toBe(401);
    });
  });

  describe('isolamento multi-tenant (escopo de evento)', () => {
    it('membro do evento A acessa o evento A', async () => {
      const res = await request(app.getHttpServer())
        .get(`/events/${eventA}/membership`)
        .set('Authorization', `Bearer ${await token('oper@a.com')}`);
      expect(res.status).toBe(200);
      expect(res.body.role).toBe(Role.OPERADOR);
    });

    it('membro do evento A NÃO acessa o evento B (403)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/events/${eventB}/membership`)
        .set('Authorization', `Bearer ${await token('oper@a.com')}`);
      expect(res.status).toBe(403);
    });
  });

  describe('RBAC', () => {
    it('operador não vê relatórios (403)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/events/${eventA}/reports`)
        .set('Authorization', `Bearer ${await token('oper@a.com')}`);
      expect(res.status).toBe(403);
    });

    it('supervisor vê relatórios (200)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/events/${eventA}/reports`)
        .set('Authorization', `Bearer ${await token('sup@a.com')}`);
      expect(res.status).toBe(200);
    });
  });

  describe('senha administrativa + auditoria', () => {
    it('operador não executa ação crítica (403 por perfil)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/events/${eventA}/admin-action`)
        .set('Authorization', `Bearer ${await token('oper@a.com')}`)
        .send({ adminPassword: ADMIN_PASSWORD_A, reason: 'tentativa' });
      expect(res.status).toBe(403);
    });

    it('admin com senha admin errada é barrado (403)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/events/${eventA}/admin-action`)
        .set('Authorization', `Bearer ${await token('admin@a.com')}`)
        .send({ adminPassword: 'errada', reason: 'justificativa' });
      expect(res.status).toBe(403);
    });

    it('admin com senha admin correta executa e gera auditoria', async () => {
      const res = await request(app.getHttpServer())
        .post(`/events/${eventA}/admin-action`)
        .set('Authorization', `Bearer ${await token('admin@a.com')}`)
        .send({ adminPassword: ADMIN_PASSWORD_A, reason: 'ajuste autorizado' });
      expect(res.status).toBe(201);

      const log = await prisma.auditLog.findFirst({
        where: { action: 'ADMIN_ACTION', eventId: eventA, userId: 'u-admin' },
      });
      expect(log).not.toBeNull();
    });

    it('login gera registro de auditoria AUTH_LOGIN', async () => {
      await login('sup@a.com');
      const log = await prisma.auditLog.findFirst({
        where: { action: 'AUTH_LOGIN', userId: 'u-sup' },
      });
      expect(log).not.toBeNull();
    });
  });

  describe('auditoria é append-only (trigger no banco)', () => {
    it('bloqueia UPDATE em AuditLog', async () => {
      const log = await prisma.auditLog.create({ data: { action: 'TESTE_IMUTAVEL' } });
      await expect(
        prisma.auditLog.update({ where: { id: log.id }, data: { action: 'ALTERADO' } }),
      ).rejects.toThrow();
    });

    it('bloqueia DELETE em AuditLog', async () => {
      const log = await prisma.auditLog.create({ data: { action: 'TESTE_IMUTAVEL_2' } });
      await expect(
        prisma.auditLog.delete({ where: { id: log.id } }),
      ).rejects.toThrow();
    });
  });

  describe('refresh token com rotação', () => {
    it('emite novo par e invalida o refresh usado', async () => {
      const loginRes = await login('admin@a.com');
      const refreshToken = loginRes.body.refreshToken as string;

      const first = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken });
      expect(first.status).toBe(200);
      expect(first.body.accessToken).toEqual(expect.any(String));

      // Reutilizar o mesmo refresh token deve falhar (rotação).
      const reuse = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken });
      expect(reuse.status).toBe(401);
    });
  });
});
