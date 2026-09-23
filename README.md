# Arte no Jardim

E-commerce da Arte no Jardim: monorepo pnpm com três apps e um pacote compartilhado.

| Pasta | O que é | Produção |
|---|---|---|
| `apps/api` | API Express + Prisma (dona de todo dado) e o worker do RabbitMQ | `api.artenojardim.com.br` |
| `apps/store` | Loja (Next.js) | `artenojardim.com.br` |
| `apps/admin` | Painel do lojista (Next.js) | `admin.artenojardim.com.br` |
| `packages/shared` | Contratos Zod, rotas e constantes usados pelos três | — |

Regras de código: [CLAUDE.md](CLAUDE.md). Arquitetura: [docs/arquitetura.md](docs/arquitetura.md).
Histórico, decisões e incidentes da VPS: [docs/infra-vps.md](docs/infra-vps.md).

---

# Deploy

Não há CI/CD: o deploy é manual, por SSH, na VPS `23.29.114.96`, no diretório
`/var/www/artenojardim`. Leva uns 5 minutos.

## Antes de tudo: o que é diferente nesta VPS

- **A VPS é compartilhada com outro projeto** (`rag_sefaz`, com os processos PM2 `api`, `web`
  e `ai-service`). Nossos processos têm o prefixo `artenojardim-`. **Nunca** rode comandos
  PM2 sem nome (`pm2 restart all`, `pm2 reload ecosystem.config.cjs`) nem mexa no banco
  `rag_sefaz`.
- **Dev e produção usam o MESMO banco.** Rodar `prisma migrate dev` na sua máquina (pelo
  túnel) já aplica a migration em produção, **com o código antigo ainda no ar**. Por isso:
  - toda migration precisa ser **compatível com o código que está rodando**. Criar tabela ou
    coluna opcional é seguro. Renomear, apagar ou tornar obrigatório exige deploy em duas etapas;
  - no deploy, `migrate deploy` quase sempre responde "No pending migrations". É normal.
- **Os apps Next precisam de `restart`, não de `reload`.** O `next start` lê o `.next` só no
  boot, e o `reload` mantém o build antigo: as rotas novas dão 404 e as antigas funcionam.
  O worker também precisa de `restart`, porque o `reload` responde ✓ e mantém o código velho.
  Só a API aceita `reload`.

## Processos e portas

| PM2 | App | Porta (só `127.0.0.1`) | Recarregar com |
|---|---|---|---|
| `artenojardim-api` | API Express | 4000 | `pm2 reload` |
| `artenojardim-worker` | Consumidores do RabbitMQ | — | `pm2 restart` |
| `artenojardim-store` | Loja Next | 3010 | `pm2 restart` |
| `artenojardim-admin` | Admin Next | 3011 | `pm2 restart` |

O Nginx (`/etc/nginx/sites-available/artenojardim`, cópia de
[deploy/nginx/artenojardim.conf](deploy/nginx/artenojardim.conf)) faz o TLS e repassa cada
domínio para a sua porta. A definição dos processos está em [ecosystem.config.cjs](ecosystem.config.cjs).

## 1. Na sua máquina

```powershell
pnpm typecheck
pnpm test
pnpm build          # pega erro de build do Next antes de ele acontecer na VPS
git push origin main
```

Se o deploy tiver migration nova, ela **já foi aplicada** no banco quando você rodou
`migrate dev`. Confira que ela é compatível com o código antigo (ver acima).

## 2. Na VPS

Entrar:

```powershell
plink -i C:\Users\2cta\Documents\placeadmin_vps.ppk root@23.29.114.96
```

Rodar, **na ordem**:

```bash
cd /var/www/artenojardim

git pull --ff-only                               # recusa se a VPS tiver commit local
pnpm install --frozen-lockfile                   # instala só o que está no lockfile
pnpm --filter @ecommerce/api exec prisma generate  # client do Prisma com o schema novo
pnpm build:shared                                # antes do resto: os apps leem os tipos do dist/
pnpm -r build                                    # api (tsc), store e admin (next build)

cd apps/api && pnpm exec prisma migrate deploy && cd -   # deploy, NUNCA dev

pm2 reload  artenojardim-api
pm2 restart artenojardim-worker
pm2 restart artenojardim-store artenojardim-admin

pm2 restart artenojardim-api artenojardim-worker artenojardim-store artenojardim-admin
```

**Se algum build falhar, pare antes dos comandos `pm2`.** Os processos continuam servindo o
build anterior, e a loja não cai. Corrija, faça o push e recomece do `git pull`.

## 3. Conferir

```bash
pm2 ls | grep artenojardim                # uptime zerado (segundos) nos 4, status online
curl -s http://127.0.0.1:4000/api/v1/health   # "database":"up","queue":"up"
curl -s -o /dev/null -w "%{http_code}\n" https://artenojardim.com.br/
curl -s -o /dev/null -w "%{http_code}\n" https://admin.artenojardim.com.br/entrar
pm2 logs artenojardim-api --lines 50 --nostream   # sem erro novo
```

Depois disso:
- abra no navegador a tela ou rota que o deploy trouxe;
- faça login no admin.

A loja cacheia o catálogo por 60 s (ISR), então o conteúdo pode levar até 1 minuto para
atualizar.

Os logs ficam em `/var/www/artenojardim/logs/` (`api-*`, `worker-*`, `store-*`, `admin-*`).

---

## Casos especiais

**Mudou o `.env` da API** (`apps/api/.env`, `chmod 600`, fora do git):

```bash
pm2 restart artenojardim-api artenojardim-worker --update-env
```

Sem `--update-env`, o PM2 não relê o ambiente. A API recusa subir se faltar variável
obrigatória: confira `pm2 logs artenojardim-api` logo depois.

**Mudou uma variável `NEXT_PUBLIC_*`** (`apps/store/.env` ou `apps/admin/.env`), por exemplo
`NEXT_PUBLIC_API_URL` ou `NEXT_PUBLIC_CDN_HOST`: essas variáveis são **fixadas no build**.
Um restart não basta. Rode `pnpm --filter @ecommerce/store build` (ou `admin`) e depois o
`pm2 restart` do app.

**Processo PM2 novo** (entrou um app no `ecosystem.config.cjs`): `reload` e `restart` não
servem, porque o processo ainda não existe.

```bash
pm2 start ecosystem.config.cjs --only artenojardim-<nome>
pm2 save        # grava a lista que volta após reboot — só quando a lista mudou de propósito
```

**Mudou a config do Nginx** ([deploy/nginx/artenojardim.conf](deploy/nginx/artenojardim.conf)):

```bash
cp /etc/nginx/sites-available/artenojardim /root/artenojardim.nginx.bak-$(date +%Y%m%d-%H%M%S)
cp deploy/nginx/artenojardim.conf /etc/nginx/sites-available/artenojardim
nginx -t && systemctl reload nginx     # NUNCA recarregue sem o -t passar
```

Um erro de config derruba o Nginx inteiro, e com ele os sites do outro projeto. Se o
`nginx -t` falhar, restaure o backup. A VPS usa o nginx 1.18: HTTP/2 é
`listen 443 ssl http2`, não `http2 on;`.

**Migration arriscada** (apaga ou transforma dado): faça um backup antes.

```bash
artenojardim-pg-backup        # dump em /var/backups/artenojardim/
```

## Rollback

Volte o código para o commit anterior e refaça o build e os restarts:

```bash
cd /var/www/artenojardim
git log --oneline -5                  # ache o commit bom
git checkout <commit-bom>
pnpm install --frozen-lockfile
pnpm --filter @ecommerce/api exec prisma generate
pnpm build:shared && pnpm -r build
pm2 reload artenojardim-api
pm2 restart artenojardim-worker artenojardim-store artenojardim-admin
```

Depois, corrija na `main` e faça o deploy normal. Na VPS, antes do próximo `git pull`, rode
`git checkout main`.

O Prisma **não desfaz migrations**. Por isso elas precisam ser compatíveis com o código
anterior: assim o rollback do código funciona com o banco como está. Se a migration destruiu
dado, a saída é o dump: `artenojardim-pg-restore` restaura por padrão num banco de teste. Leia
a seção Backup em [docs/infra-vps.md](docs/infra-vps.md) antes de restaurar em produção.
