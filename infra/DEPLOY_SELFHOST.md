# Deploy self-host (build no seu servidor) — sobe TUDO, inclusive o banco

Sobe **Postgres + Redis + API + Painel web** com um comando, buildando as imagens
no próprio servidor. As **migrations rodam sozinhas** no start da API, e o banco fica
em um **volume Docker** (dados persistem entre reinícios).

> App do terminal (POS): NÃO entra aqui — ele é gerado como APK pelo EAS/Expo e
> instalado nas maquininhas (ver `docs/HANDOFF.md`). Este pacote é o **servidor**.

## 1. Pré-requisitos no servidor (Ubuntu/Debian)
- Docker + Docker Compose plugin:
  ```bash
  curl -fsSL https://get.docker.com | sh
  ```
- Portas livres: **3000** (API), **3001** (painel), **5432/6379** ficam internas.

## 2. Configurar os segredos
```bash
cd infra
cp .env.prod.example .env
nano .env          # preencha POSTGRES_PASSWORD, JWT_SECRET, JWT_REFRESH_SECRET, NEXT_PUBLIC_API_URL
```
- **JWT_SECRET / JWT_REFRESH_SECRET:** gere fortes → `openssl rand -hex 32` (um para cada).
- **NEXT_PUBLIC_API_URL:** a URL pública da API (o painel embute no build). Em teste
  pode ser `http://IP_DO_SERVIDOR:3000`; em produção, `https://api.seudominio.com.br`.

## 3. Subir tudo (build + up)
```bash
docker compose -f docker-compose.prod.yml --env-file .env up -d --build
```
- 1ª vez demora (builda API e painel). Depois sobe em segundos.
- A API roda `prisma migrate deploy` e sobe; o Postgres já vem junto (volume `pgdata`).

## 4. Conferir
```bash
docker compose -f docker-compose.prod.yml ps         # tudo "healthy"/"running"
curl http://localhost:3000/health                    # {"status":"ok",...}
```
- Painel: `http://IP_DO_SERVIDOR:3001`.
- Swagger da API: `http://IP_DO_SERVIDOR:3000/docs`.

## 5. Primeiro acesso (sem seed de demo em produção)
Crie sua empresa/evento pelo **wizard do painel**. Se quiser popular dados de DEMO
para testar rápido (NÃO faça em produção real):
```bash
docker compose -f docker-compose.prod.yml exec api npx prisma db seed
```

## 6. HTTPS (recomendado — exigido para homologar o PagBank)
Coloque um proxy reverso na frente (Caddy/Nginx/Traefik) apontando seu domínio para
as portas 3000 (API) e 3001 (painel), com Let's Encrypt. Depois **rebuild o painel**
com `NEXT_PUBLIC_API_URL=https://api.seudominio.com.br` (o valor é embutido no build):
```bash
docker compose -f docker-compose.prod.yml --env-file .env up -d --build web
```

## 7. Operação
- **Logs:** `docker compose -f docker-compose.prod.yml logs -f api`
- **Atualizar código:** substitua os arquivos e rode de novo o `up -d --build`.
- **Backup do banco:** ver `infra/backup/` (cron diário + `restore.sh`). **Teste o restore.**
- **Parar:** `docker compose -f docker-compose.prod.yml down` (os dados ficam nos volumes).
- **Apagar TUDO, inclusive dados:** `docker compose ... down -v` (cuidado: remove o banco).

## Problemas comuns
- **Painel não carrega dados:** `NEXT_PUBLIC_API_URL` errado no build → rebuild o `web`.
- **API não sobe / erro de migration:** confira `POSTGRES_*` no `.env` e os logs da API.
- **PagBank:** só ligue `PAGBANK_ENABLED=true` com token + URL pública após o sandbox.
