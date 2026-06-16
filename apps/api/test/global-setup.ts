import { execSync } from 'node:child_process';

/** Aplica as migrations no banco de teste antes da suíte rodar. */
export default function globalSetup(): void {
  const databaseUrl =
    process.env.DATABASE_URL ?? 'postgresql://pdv:pdv@127.0.0.1:5432/pdv_test?schema=public';

  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });
}
