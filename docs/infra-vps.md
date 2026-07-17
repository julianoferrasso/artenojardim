# VPS — estado e decisões de infraestrutura

**Host:** `23.29.114.96` · Ubuntu 22.04.5 LTS · PostgreSQL 16.14 · Node 24.18 · nginx 1.18
**Acesso:** `root` por chave (`placeadmin_vps.ppk`, formato PuTTY)
**Código:** `/var/www/artenojardim` · **Logs:** `/var/www/artenojardim/logs/`

> Esta VPS é **compartilhada** com outro projeto (`rag_sefaz` + apps `api`/`web`/`ai-service`
> no PM2, e `insightia`, parado). Toda mudança aqui foi feita com `reload` em vez de
> `restart` justamente para não derrubar as conexões deles. **Continue nesse cuidado.**

---

## Deploy

```bash
ssh root@23.29.114.96
cd /var/www/artenojardim
git pull
pnpm install --frozen-lockfile        # frozen: produção usa o que foi testado
pnpm --filter @ecommerce/shared build # primeiro: os outros resolvem tipos pelo dist/
pnpm -r build
cd apps/api && pnpm exec prisma migrate deploy && cd -   # deploy, NUNCA dev
pm2 reload ecosystem.config.cjs       # reload, não restart: sem downtime
```

### Topologia

| Domínio | App | Porta | PM2 |
|---|---|---|---|
| `artenojardim.com.br` | store (Next) | 3010 | `artenojardim-store` |
| `admin.artenojardim.com.br` | admin (Next) | 3011 | `artenojardim-admin` |
| `api.artenojardim.com.br` | api (Express) | 4000 | `artenojardim-api` |

Os três escutam **só em `127.0.0.1`** — quem fala com eles é o Nginx, na mesma máquina.
`artenojardim.com`, `www.*` e `http://` redirecionam 301 para o canônico.

> **Nomes com prefixo `artenojardim-`**: o outro projeto já usa `api`, `web` e `ai-service`
> no PM2. Um `pm2 restart api` distraído derrubaria a produção alheia.
>
> **Porta 3000 é do `rag_sefaz/web`.** Não use.

### Armadilhas que custaram tempo (não repita)

**`next start --port 3000` no `package.json`.** Um flag de CLI vence a env `PORT` do PM2,
então o store tentava subir na porta do OUTRO projeto (`EADDRINUSE`, 9 restarts) e o admin
subia na 3001 em vez da 3011 — "online" no PM2, e o Nginx procurando onde não havia ninguém.
`start` não leva `--port`; quem manda é a env.

**Next 16 não lê a env `HOSTNAME`.** No `--help`, `--port` declara `(env: PORT)` e
`--hostname` não declara nada. Só o flag funciona — e no `pnpm` ele vai **sem `--`**, senão
o next lê `--hostname` como diretório do projeto.

**`gzip on` no contexto `http`** é duplicata do `nginx.conf` global e o nginx recusa subir
inteiro. O global tem `gzip on` com todos os `gzip_types` **comentados** (só comprime HTML);
declarar os tipos no `http` consertaria isso para o outro projeto também — daí a repetição
por `server`.

**`http2 on;` não existe no nginx 1.18** (veio no 1.25.1). Aqui é `listen 443 ssl http2;`.

> Nas três vezes em que a config quebrou, o `nginx -t` pegou **antes** do reload e o script
> reverteu sozinho. Os sites do outro projeto nunca saíram do ar. **Sempre valide antes de
> recarregar.**

### Node 24

Atualizado de 20 (EOL desde abril/2026) via NodeSource, com o Node do sistema compartilhado
com o outro projeto. Os apps deles foram reiniciados **um por vez** e verificados: os erros
que aparecem no log são "Failed to find Server Action" de horas antes (bundle velho no
cliente, normal no Next) e um `psycopg AdminShutdown` do restart do Postgres — nenhum do
Node 24. O `ai-service` é Python e nem é afetado.

Rollback, se preciso: `curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt-get install -y nodejs`.

---

## Como desenvolver contra este banco

```powershell
.\scripts\db-tunnel.ps1     # deixe a janela aberta
pnpm dev:api                # em outro terminal
```

A porta 5432 **não** é acessível pela internet. O túnel encaminha
`127.0.0.1:5433` (local) → `127.0.0.1:5432` (VPS), e o Postgres enxerga a conexão vindo
do loopback — que é o que o `pg_hba.conf` permite.

**Por que túnel e não liberar a 5432 para o seu IP:** IP residencial é dinâmico. No dia
em que ele mudar, o banco fica inacessível e consertar exige entrar na VPS — justamente
quando você quer trabalhar. O túnel não depende do seu IP.

## Bancos e roles

| Banco | Dono | Quem conecta |
|---|---|---|
| `artenojardim` | `artenojardim` | `artenojardim` |
| `artenojardim_shadow` | `artenojardim` | `artenojardim` — descartável, só do `migrate dev` |
| `rag_sefaz` | `rag_user` | `rag_user` — **outro projeto, não toque** |

O role `artenojardim` **não** é superuser, **não** tem `CREATEDB` nem `CREATEROLE`.
É de propósito: um servidor compartilhado não deve dar à aplicação poder de criar bancos.

### O shadow database

`prisma migrate dev` precisa de um banco descartável para detectar drift e, por padrão,
o cria sozinho — o que exigiria `CREATEDB` no role. Em vez de ampliar o privilégio, o
`artenojardim_shadow` foi pré-criado e é de posse do role. Configurado em
`apps/api/prisma.config.ts`. Produção usa `migrate deploy`, que não usa shadow.

---

## Auditoria de segurança — 16/07/2026

### O que foi encontrado

| Achado | Gravidade |
|---|---|
| `PasswordAuthentication yes` + `PermitRootLogin yes` no SSH | **Crítico** |
| **108.413** tentativas de login SSH falhas no `auth.log` (23.453 de um único IP) | **Crítico** |
| `fail2ban` não instalado — nada limitava as tentativas | **Crítico** |
| `ufw allow 5432 Anywhere` — Postgres exposto à internet | **Alto** |
| `pg_hba`: `host all all 0.0.0.0/0` — qualquer usuário, qualquer banco, de qualquer lugar | **Alto** |
| Role `artenojardim` conseguia `CONNECT` no banco `rag_sefaz` (herança do `PUBLIC`) | Médio |

O log mostrava `5 Accepted password` — autenticação por senha não era teórica, funcionava.
Com root+senha habilitados, sem rate limit, sob ataque contínuo, a queda da senha do root
levaria junto os dois projetos e o banco.

### O que foi feito

1. **fail2ban** instalado (`jail.local`, jail `sshd`, `backend=systemd`, `maxretry=3`,
   ban progressivo até 1 semana). `ignoreip` inclui `191.57.28.6` — sem isso, um erro de
   digitação bane você do próprio servidor.
2. **SSH**: `PasswordAuthentication no`, `PermitRootLogin prohibit-password`,
   `MaxAuthTries 3`. Verificado de fora: senha recebe `Permission denied (publickey)`.
3. **UFW**: regra da 5432 removida. Sobraram OpenSSH, 80, 443 — como a arquitetura pede.
4. **pg_hba**: linha `host all all 0.0.0.0/0` removida; só loopback. Aplicado com
   `pg_reload_conf()`, sem restart, sem derrubar o outro projeto.
5. **`CONNECT` cruzado**: revogado do `PUBLIC` e concedido explicitamente ao dono de cada
   banco. `artenojardim` → `rag_sefaz` agora é `false`.

Resultado medido: fail2ban baniu 4 atacantes nos primeiros minutos, incluindo três que
estavam no top-5 da lista de ataques. O site do outro projeto seguiu respondendo HTTP 200,
com zero erros de banco.

### Duas armadilhas que valem lembrar

**`PermitRootLogin no` teria trancado o acesso.** O login é como root por chave. O valor
correto é `prohibit-password`: mata a senha e preserva a chave.

**O `sshd_config` principal não era quem mandava.** `/etc/ssh/sshd_config.d/50-cloud-init.conf`
tinha `PasswordAuthentication yes`, e o `Include` fica na linha 12 do arquivo principal —
**no sshd, o primeiro valor vence, não o último**. Editar só o arquivo principal não surtia
efeito nenhum. Sempre confira com `sshd -T`, que mostra a config efetiva, e não com `grep`
no `sshd_config`.

---

6. **`listen_addresses = 'localhost'`** (16/07/2026, com restart autorizado). O Postgres
   deixou de escutar em `0.0.0.0:5432` e `[::]:5432` — só `127.0.0.1:5432` restou. Terceira
   camada, somada ao UFW e ao `pg_hba`. Verificado após o restart: os 3 apps do outro projeto
   seguiram online, site em HTTP 200, zero erros de conexão; nosso túnel e o pool do Prisma
   reconectaram sozinhos em segundos.

## Pendências

**DNS: `api.` e `admin.` não existem** (NXDOMAIN; nameservers na GoDaddy). O Nginx já está
configurado e responde 200 quando testado por `Host` header — falta só o registro:

```
A  api    -> 23.29.114.96
A  admin  -> 23.29.114.96
```

Assim que propagar, o certificado precisa incluir os subdomínios:

```bash
certbot --nginx -d artenojardim.com -d www.artenojardim.com \
        -d artenojardim.com.br -d www.artenojardim.com.br \
        -d api.artenojardim.com.br -d admin.artenojardim.com.br
```

Até lá o **admin não é utilizável**: o browser precisa alcançar `api.artenojardim.com.br`,
que é a URL assada no bundle em tempo de build.

**A senha do banco é fraca.** `@rteNoJardim!` é o nome da marca com leetspeak — cai em
ataque de dicionário. Enquanto a 5432 estava aberta isso era urgente; com ela fechada, o
risco caiu muito. Ainda assim, vale trocar por uma senha aleatória antes de a loja entrar
no ar (`openssl rand -base64 32`), atualizando o `.env`.

**Backup não existe.** Nenhum `pg_dump` agendado. A arquitetura trata isso como obrigatório
(§7): numa VPS única, é a diferença entre um susto e o fim do negócio. Entra na Fase 1,
item 18 — junto com o teste de restore, porque backup nunca testado é backup inexistente.

## Backups da configuração

Tudo que foi alterado tem cópia com timestamp na VPS:

- `/etc/ssh/sshd_config.bak-20260716-172722`
- `/etc/ssh/sshd_config.d/*.conf.bak-*`
- `/etc/postgresql/16/main/pg_hba.conf.bak-20260716-174415`
