# Publicar o painel web no Netlify

O painel é Next.js (App Router) e pode ser hospedado no Netlify. A **API continua no
Coolify/VPS** — o painel só consome a URL pública dela.

> Pré-requisito: a API já precisa estar no ar com uma URL pública (passo 4 do
> `DEPLOY_COOLIFY.md`), porque `NEXT_PUBLIC_API_URL` é embutido no **build**.

## Passos
1. No Netlify: **Add new site → Import from Git** e selecione `dom-bars-pdv`.
2. O `netlify.toml` (na raiz) já define build e o plugin do Next. Confirme:
   - **Build command:** `corepack enable && pnpm install --frozen-lockfile && pnpm --filter @dom-bars/web build`
   - **Publish directory:** `apps/web/.next`
3. **Site settings → Environment variables:**
   - `NEXT_PUBLIC_API_URL = https://api.seudominio.com.br`
4. **Deploy site.** Ao final, o Netlify dá uma URL (ex.: `seu-painel.netlify.app`);
   você pode apontar um domínio próprio (`painel.seudominio.com.br`).

## Observações (monorepo pnpm)
- Se o build não achar o workspace, em **Site configuration → Build & deploy → Build settings**
  deixe **Base directory** vazio (raiz do repo) — o install roda na raiz e compila só o web.
- Sempre que mudar a URL da API, **refaça o deploy** (a variável entra no build).
- CORS já está liberado na API, então o painel no Netlify fala com a API no Coolify sem ajuste.
