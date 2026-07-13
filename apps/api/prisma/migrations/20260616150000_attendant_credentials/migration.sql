-- Credenciais de atendente por evento (login por CPF; senha/validade/ativo por evento).

-- User: e-mail e senha global passam a ser opcionais; adiciona CPF único.
ALTER TABLE "User" ALTER COLUMN "email" DROP NOT NULL;
ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL;
ALTER TABLE "User" ADD COLUMN "cpf" TEXT;
CREATE UNIQUE INDEX "User_cpf_key" ON "User"("cpf");

-- EventMembership: credencial do atendente controlada pelo Admin.
ALTER TABLE "EventMembership" ADD COLUMN "passwordHash" TEXT;
ALTER TABLE "EventMembership" ADD COLUMN "expiresAt" TIMESTAMP(3);
ALTER TABLE "EventMembership" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;
