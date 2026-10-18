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

# Desenvolvimento

O Postgres vive na VPS e não é exposto na internet. A API local alcança o banco por um túnel SSH:

```powershell
.\scripts\db-tunnel.ps1     # 127.0.0.1:5433 (local) -> VPS:5432; deixe a janela aberta
pnpm dev:api                # em outro terminal
```

`ECONNREFUSED 127.0.0.1:5433` = o túnel caiu (reabra o script), não o banco.
`P1000 Authentication failed` = a senha do `apps/api/.env` local está desatualizada.

**Dev e produção usam o MESMO banco.** `prisma migrate dev` na sua máquina já aplica a migration
em produção, com o código antigo ainda no ar. Por isso toda migration precisa ser compatível com
o código que está rodando: criar tabela ou coluna opcional é seguro; renomear, apagar ou tornar
obrigatório exige deploy em duas etapas.

---

# Deploy

Não há CI/CD: o deploy é manual, por SSH, na VPS `179.199.150.80`, no diretório
`/var/www/artenojardim`. Leva uns 10 minutos (o build é o grosso).

## Antes de tudo: o que é diferente nesta VPS

- **A VPS é compartilhada** com o **placeadmin** (produção crítica) e o **financee**. Cada projeto
  tem usuário Linux, PM2 e banco próprios. Os nossos processos rodam no PM2 do usuário
  `artenojardim` e têm o prefixo `artenojardim-`. Nunca rode `pm2` sem nome (`pm2 restart all`,
  `pm2 reload ecosystem.config.cjs`) e nunca toque em processo, porta ou banco dos outros.
- **Entra-se como root; a aplicação roda pelo atalho `aj`**, que executa o comando como o usuário
  `artenojardim` com o Node dele: `aj pm2 ls`, `aj 'cd /var/www/artenojardim && git pull'`.
- **A API escuta na 4020, não na 4000.** A 4000 é o Grafana do placeadmin.
- **Os apps Next precisam de `restart`, não de `reload`.** O `next start` lê o `.next` só no
  boot, e o `reload` mantém o build antigo: as rotas novas dão 404 e as antigas funcionam.
  O worker também precisa de `restart` (o `reload` responde ✓ e mantém o código velho).
  Só a API aceita `reload`.
- **O SSH cai em comando longo.** O `pnpm -r build` passa de alguns minutos e o plink costuma
  morrer no meio ("Software caused connection abort"), levando o build junto. Rode o build
  com `nohup`, como abaixo.
- **O fuso da VPS é UTC.**

## Processos e portas

| PM2 | App | Porta (só `127.0.0.1`) | Recarregar com |
|---|---|---|---|
| `artenojardim-api` | API Express | **4020** | `pm2 reload` |
| `artenojardim-worker` | Consumidores do RabbitMQ | — | `pm2 restart` |
| `artenojardim-store` | Loja Next | 3010 | `pm2 restart` |
| `artenojardim-admin` | Admin Next | 3011 | `pm2 restart` |

O Nginx (`/etc/nginx/sites-available/artenojardim`, cópia de
[deploy/nginx/artenojardim.conf](deploy/nginx/artenojardim.conf)) faz o TLS e repassa cada
domínio para a sua porta. A definição dos processos está em [ecosystem.config.cjs](ecosystem.config.cjs).

## 1. Na sua máquina

```powershell
pnpm build:shared
pnpm -r typecheck
pnpm --filter @ecommerce/api test
git push origin main
```

Se o deploy tiver migration nova e você já rodou `migrate dev`, ela **já está** no banco de
produção. Confira que é compatível com o código antigo (ver Desenvolvimento).

## 2. Na VPS

Entrar (como root):

```powershell
plink -i C:\Users\2cta\.ssh\ed_25519-hostinger.ppk root@179.199.150.80
```

**Backup** antes de qualquer migration:

```bash
/usr/local/bin/artenojardim_backup.sh     # imprime "ok <arquivo> bytes=... entradas=..."
```

**Código e build** — o build roda em segundo plano, para sobreviver à queda do SSH:

```bash
aj 'cd /var/www/artenojardim && git pull --ff-only'     # recusa se a VPS tiver commit local

aj 'cd /var/www/artenojardim && nohup bash -c "set -e; pnpm install --frozen-lockfile; \
  pnpm --filter @ecommerce/api exec prisma generate; pnpm build:shared; pnpm -r build; \
  echo BUILD_OK" > /tmp/aj-deploy-build.log 2>&1 < /dev/null &'

tail -f /tmp/aj-deploy-build.log            # espere o BUILD_OK (Ctrl+C sai do tail, não do build)
```

**Se o log não terminar em `BUILD_OK`, pare aqui.** Os processos continuam servindo o build
anterior e a loja não cai. Corrija, faça o push e recomece do `git pull`.

**Migration e restart:**

```bash
aj 'cd /var/www/artenojardim/apps/api && pnpm exec prisma migrate deploy'   # deploy, NUNCA dev

aj 'pm2 reload artenojardim-api'
aj 'pm2 restart artenojardim-worker artenojardim-store artenojardim-admin'
```

Mudou algum `.env` neste deploy? Troque os dois comandos `pm2` acima por:

```bash
aj 'cd /var/www/artenojardim && pm2 restart artenojardim-api artenojardim-worker artenojardim-store artenojardim-admin --update-env'
```

`migrate deploy` quase sempre responde "No pending migrations" (a migration já foi aplicada pelo
`migrate dev`). É normal.

## 3. Conferir

```bash
aj 'pm2 ls | grep artenojardim'                        # uptime em segundos nos 4, status online
curl -s http://127.0.0.1:4020/api/v1/health; echo      # "database":"up","queue":"up"
curl -s -o /dev/null -w "%{http_code}\n" https://artenojardim.com.br/
curl -s -o /dev/null -w "%{http_code}\n" https://admin.artenojardim.com.br/entrar
aj 'pm2 logs artenojardim-api --lines 50 --nostream'   # sem erro novo
```

Depois disso:
- abra no navegador a tela ou rota que o deploy trouxe;
- faça login no admin.

**Cache da loja:** a cada mudança de produto, a API avisa a loja (`POST /api/revalidate`) e o
catálogo atualiza na hora. O TTL de 60 s do ISR é só a rede de segurança se o aviso falhar.
Logo após um deploy da loja, a primeira visita a cada página ainda pode vir do cache antigo.

Os logs ficam em `/var/log/artenojardim/` (`api-*`, `worker-*`, `store-*`, `admin-*`).

---

## Casos especiais

**Mudou o `.env` da API** (`apps/api/.env`, `chmod 600`, fora do git): restart com
`--update-env` (ver acima). Sem ele, o PM2 não relê o ambiente. A API recusa subir se faltar
variável obrigatória: confira `pm2 logs artenojardim-api` logo depois.

**Chavear o Mercado Pago entre produção e teste:** os dois pares de credenciais ficam no
`apps/api/.env` (`MP_*` e `MP_*_TEST`), e só `MP_ENVIRONMENT` muda:

```bash
aj "cd /var/www/artenojardim/apps/api && sed -i 's/^MP_ENVIRONMENT=.*/MP_ENVIRONMENT=test/' .env"   # ou =production
aj 'cd /var/www/artenojardim && pm2 restart artenojardim-api --update-env'
grep '"msg":"Mercado Pago"' /var/log/artenojardim/api-out-0.log | tail -n 1   # confira o environment
```

Em `test` o boot avisa (warn): numa loja pública, cartão de teste aprova pedido de verdade — use
só em janela de teste. Pagamento criado num ambiente só é lido, cancelado e reembolsado nele
mesmo; voltar para `test` com pedido real aberto deixa esse pedido sem estorno pela API.

**Mudou o `.env` da loja ou do admin** (`apps/store/.env`, `apps/admin/.env`):
- variável comum (ex.: `REVALIDATE_SECRET`): basta o `pm2 restart` do app;
- variável `NEXT_PUBLIC_*` (ex.: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_CDN_HOST`): é **fixada no
  build**. Rode `pnpm --filter @ecommerce/store build` (ou `admin`) e depois o `pm2 restart`.

**Segredo da revalidação:** `STORE_REVALIDATE_SECRET` (API) e `REVALIDATE_SECRET` (loja) têm
de ter o **mesmo** valor. Trocar: `openssl rand -hex 32`, gravar nos dois `.env` e reiniciar
API e loja com `--update-env`. Sem ele, nada quebra, mas a loja só atualiza pelo TTL de 60 s.

**Processo PM2 novo** (entrou um app no `ecosystem.config.cjs`): `reload` e `restart` não
servem, porque o processo ainda não existe.

```bash
aj 'cd /var/www/artenojardim && pm2 start ecosystem.config.cjs --only artenojardim-<nome> && pm2 save'
```

**Mudou a config do Nginx** ([deploy/nginx/artenojardim.conf](deploy/nginx/artenojardim.conf)):

```bash
cp /etc/nginx/sites-available/artenojardim /root/artenojardim.nginx.bak-$(date +%Y%m%d-%H%M%S)
cp /var/www/artenojardim/deploy/nginx/artenojardim.conf /etc/nginx/sites-available/artenojardim
nginx -t && systemctl reload nginx     # NUNCA recarregue sem o -t passar
```

Um erro de config derruba o Nginx inteiro, e com ele os sites do placeadmin e do financee. Se o
`nginx -t` falhar, restaure o backup.

## Backup

- **Automático:** `artenojardim-backup.timer` (systemd), todo dia às **06:30 UTC**, roda
  `/usr/local/bin/artenojardim_backup.sh`.
- **Onde:** `/var/backups/artenojardim/artenojardim-<data>.dump` (`pg_dump -Fc`), retenção de 14 dias.
- **Validação:** o script recusa dump pequeno demais e confere que o `pg_restore --list` lê o arquivo.
- **Ainda não há cópia off-site:** os dumps vivem na mesma VPS que o banco.

Restaurar (não há script de restore instalado na VPS nova): restaure **primeiro num banco de
teste** e confira as contagens antes de pensar em produção.

```bash
sudo -u postgres createdb artenojardim_restore_test
sudo -u postgres pg_restore -d artenojardim_restore_test --no-owner /var/backups/artenojardim/<arquivo>.dump
```

Leia a seção Backup de [docs/infra-vps.md](docs/infra-vps.md) antes de restaurar em produção.

## Rollback

Volte o código para o commit anterior e refaça o build e os restarts:

```bash
aj 'cd /var/www/artenojardim && git log --oneline -5'          # ache o commit bom
aj 'cd /var/www/artenojardim && git checkout <commit-bom>'
# build com nohup, como no passo 2, e depois:
aj 'pm2 reload artenojardim-api'
aj 'pm2 restart artenojardim-worker artenojardim-store artenojardim-admin'
```

Depois, corrija na `main` e faça o deploy normal. Na VPS, antes do próximo `git pull`, rode
`aj 'cd /var/www/artenojardim && git checkout main'`.

O Prisma **não desfaz migrations**. Por isso elas precisam ser compatíveis com o código
anterior: assim o rollback do código funciona com o banco como está. Se a migration destruiu
dado, a saída é o dump (ver Backup).
