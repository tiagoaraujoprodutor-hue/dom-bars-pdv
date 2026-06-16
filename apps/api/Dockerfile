# Imagem da API. Mantida simples e operável: aplica migrations no start
# (migrations automáticas no deploy — ver PLAN §8) e sobe o servidor.
FROM node:22-alpine
WORKDIR /app
RUN corepack enable

COPY package.json ./
RUN pnpm install

COPY . .
RUN pnpm build

ENV NODE_ENV=production
EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
