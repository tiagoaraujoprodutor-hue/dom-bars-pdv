# Deploy no Coolify (VPS) — passo a passo

Guia direto para colocar a plataforma no ar com **Coolify** em 1 VPS. Tempo estimado:
~30–45 min na primeira vez.

## 0. O que você vai precisar
- Um VPS Linux (Ubuntu 22.04/24.04), **2 vCPU / 4 GB RAM** já bastam. Hetzner CX22 ou
  DigitalOcean são ótimos custo-benefício.
- Um domínio (ex.: `seudominio.com.br`) com acesso ao DNS.
- 2 subdomínios apontando (registro A) para o IP do VPS:
  - `api.seudominio.com.br` → IP do VPS
  - `painel.seudominio.com.br` → IP do VPS  (opcional se for usar Netlify no painel)

## 1. Instalar o Coolify no VPS
SSH no servidor e rode o instalador oficial:
```bash
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
```
Abra `http://IP_DO_VPS:8000`, crie o usuário admin e finalize o onboarding.
Em **Settings**, configure seu e-mail e (se já tiver) o domínio do próprio Coolify.

## 2. Conectar este repositório
- **Sources → GitHub**: conecte sua conta e autorize o repo `dom-bars-pdv`
  (ou use “Public Repository” colando a URL do Git, se for público).

## 3. Banco e cache (recursos gerenciados do Coolify)
No seu Projeto → **+ New Resource**:
1. **PostgreSQL 16** → crie. Anote usuário, senha e nome do banco. O Coolify expõe um
   host interno (ex.: `postgresql-xxxx`).
2. **Redis 7** → crie. Anote o host interno (ex.: `redis-xxxx`).

## 4. Deploy da API
**+ New Resource → Application** apontando para o repo:
- **Build Pack:** Dockerfile
- **Base Directory:** `apps/api`
- **Dockerfile Location:** `apps/api/Dockerfile`
- **Port:** `3000`
- **Domain:** `https://api.seudominio.com.br` (Coolify cuida do SSL/Let's Encrypt)
- **Environment variables:**
  ```
  NODE_ENV=production
  PORT=3000
  DATABASE_URL=postgresql://USUARIO:SENHA@postgresql-xxxx:5432/NOME_DO_BANCO
  REDIS_URL=redis://redis-xxxx:6379
  JWT_SECRET=<openssl rand -hex 32>
  JWT_REFRESH_SECRET=<openssl rand -hex 32>
  THROTTLE_LIMIT=2000
  ```
- **Deploy.** A API **aplica as migrations automaticamente no start** (o container roda
  `prisma migrate deploy` antes de subir). Acompanhe os logs até ver “API no ar”.
- Teste: `https://api.seudominio.com.br/health` deve responder `{"status":"ok"...}` e
  `…/docs` abre o Swagger.

> Gere os segredos com `openssl rand -hex 32` (um para cada). **Não reutilize** os de exemplo.

## 5. Popular dados de demonstração (opcional, 1ª vez)
No terminal do container da API (aba **Terminal/Exec** no Coolify):
```bash
npx prisma db seed
```
Login demo: `admin@demo.com` / `senha123` (senha admin do evento demo: `admin123`).
> Em produção real, crie seu evento pelo **wizard** do painel em vez do seed.

## 6. Painel web
Duas opções:
- **No Coolify** (tudo junto): **+ New Application** → Build Pack **Dockerfile**,
  **Base Directory:** `.` (raiz), **Dockerfile Location:** `apps/web/Dockerfile`,
  **Port:** `3001`, **Domain:** `https://painel.seudominio.com.br`,
  env `NEXT_PUBLIC_API_URL=https://api.seudominio.com.br`.
- **No Netlify** (separado): ver `infra/DEPLOY_NETLIFY.md`.

## 7. Backups (faça antes do primeiro evento)
- O Coolify tem **backups agendados** para o Postgres (aba do recurso Postgres → Backups):
  ative o diário e configure um destino externo (S3/compatível) se possível.
- Alternativa por script: `infra/backup/` (cron diário + `restore.sh`). **Teste o restore.**

## 8. Atualizações
- A cada push na branch de produção, o Coolify **rebuilda e redeploya** (se o auto-deploy
  estiver ligado no recurso). Migrations aplicam no start.

## 9. Checklist final
- [ ] `https://api.seudominio.com.br/health` OK e com **HTTPS**.
- [ ] Painel abre e loga.
- [ ] Backup diário ligado e **restore testado**.
- [ ] `EXPO_PUBLIC_API_URL` dos terminais = `https://api.seudominio.com.br`.
- [ ] Rodar o teste de carga (`infra/load-test/`) apontando para a API pública.
- [ ] Seguir `infra/CHECKLIST_DIA_DE_EVENTO.md`.

## Problemas comuns
- **API não sobe / erro de migration:** confira o `DATABASE_URL` (host interno do Postgres
  do Coolify, não `localhost`).
- **Painel não carrega dados:** `NEXT_PUBLIC_API_URL` errado ou sem HTTPS; veja o console
  do navegador. CORS já está liberado na API.
- **SSL pendente:** confirme os registros A no DNS apontando para o VPS e aguarde o
  Let's Encrypt do Coolify.
