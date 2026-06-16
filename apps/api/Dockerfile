# ---- build ----
FROM node:22-alpine AS builder
WORKDIR /app
RUN corepack enable
COPY package.json ./
RUN pnpm install
COPY . .
RUN pnpm build

# ---- runtime ----
FROM node:22-alpine AS runner
WORKDIR /app
RUN corepack enable
ENV NODE_ENV=production
COPY package.json ./
RUN pnpm install --prod
COPY --from=builder /app/dist ./dist
EXPOSE 3000
CMD ["node", "dist/main.js"]
