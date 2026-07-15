# Imagem da API. Mantida simples e operável: aplica migrations no start
# (migrations automáticas no deploy — ver PLAN §8) e sobe o servidor.
FROM node:22-alpine
WORKDIR /app

# Dependências de sistema: ferramentas para compilar módulos nativos (argon2)
# e openssl/libc6-compat exigidos pelo Prisma no Alpine (musl).
RUN apk add --no-cache python3 make g++ openssl libc6-compat

RUN corepack enable

COPY package.json ./
RUN pnpm install --no-frozen-lockfile

COPY . .
RUN pnpm build

ENV NODE_ENV=production
EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
