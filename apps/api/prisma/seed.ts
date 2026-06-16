import { PrismaClient, Role } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

const DEMO_PASSWORD = 'senha123';
const DEMO_ADMIN_PASSWORD = 'admin123';

async function main(): Promise<void> {
  const passwordHash = await argon2.hash(DEMO_PASSWORD);
  const adminPasswordHash = await argon2.hash(DEMO_ADMIN_PASSWORD);

  const company = await prisma.company.upsert({
    where: { id: 'demo-company' },
    update: {},
    create: { id: 'demo-company', name: 'Bar Demo Ltda' },
  });

  const event = await prisma.event.upsert({
    where: { id: 'demo-event' },
    update: { adminPasswordHash },
    create: {
      id: 'demo-event',
      companyId: company.id,
      name: 'Festa Demo 2026',
      adminPasswordHash,
      serviceFeeEnabled: true,
      serviceFeePercent: '10.00',
    },
  });

  const profiles: { email: string; name: string; role: Role }[] = [
    { email: 'operador@demo.com', name: 'Olívia Operadora', role: Role.OPERADOR },
    { email: 'supervisor@demo.com', name: 'Sérgio Supervisor', role: Role.SUPERVISOR },
    { email: 'admin@demo.com', name: 'Ana Administradora', role: Role.ADMINISTRADOR },
  ];

  for (const p of profiles) {
    const user = await prisma.user.upsert({
      where: { email: p.email },
      update: { passwordHash },
      create: { name: p.name, email: p.email, passwordHash, companyId: company.id },
    });
    await prisma.eventMembership.upsert({
      where: { userId_eventId: { userId: user.id, eventId: event.id } },
      update: { role: p.role },
      create: { userId: user.id, eventId: event.id, role: p.role },
    });
  }

  // Ficha técnica de exemplo: Caipirinha = 50ml vodka + 1 limão + 20g açúcar.
  const category = await prisma.category.upsert({
    where: { id: 'demo-cat-drinks' },
    update: {},
    create: { id: 'demo-cat-drinks', eventId: event.id, name: 'Drinks' },
  });

  const caipirinha = await prisma.product.upsert({
    where: { id: 'demo-prod-caipirinha' },
    update: {},
    create: {
      id: 'demo-prod-caipirinha',
      eventId: event.id,
      categoryId: category.id,
      name: 'Caipirinha',
      price: '18.00',
      stock: 100,
      minStock: 10,
    },
  });

  const ingredients = [
    { id: 'demo-ing-vodka', name: 'Vodka', unit: 'ml', qty: '50' },
    { id: 'demo-ing-limao', name: 'Limão', unit: 'un', qty: '1' },
    { id: 'demo-ing-acucar', name: 'Açúcar', unit: 'g', qty: '20' },
  ];

  for (const ing of ingredients) {
    const ingredient = await prisma.ingredient.upsert({
      where: { id: ing.id },
      update: {},
      create: { id: ing.id, eventId: event.id, name: ing.name, unit: ing.unit, stock: '10000' },
    });
    await prisma.recipeItem.upsert({
      where: { productId_ingredientId: { productId: caipirinha.id, ingredientId: ingredient.id } },
      update: { quantity: ing.qty },
      create: { productId: caipirinha.id, ingredientId: ingredient.id, quantity: ing.qty },
    });
  }

  console.log('Seed concluído.');
  console.log(`  Empresa: ${company.name}`);
  console.log(`  Evento: ${event.name} (senha admin: ${DEMO_ADMIN_PASSWORD})`);
  console.log(`  Usuários (senha: ${DEMO_PASSWORD}): ${profiles.map((p) => p.email).join(', ')}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
