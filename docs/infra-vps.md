# VPS — estado e decisões de infraestrutura

**Host:** `179.199.150.80` · Debian 13 (trixie) · PostgreSQL 16.15 · Node 24.21 · nginx 1.26
**Acesso:** `root` por chave (`C:\Users\2cta\.ssh\ed_25519-hostinger.ppk`, formato PuTTY)
**Código:** `/var/www/artenojardim` · **Logs:** `/var/log/artenojardim/`
**Usuário de serviço:** `artenojardim` (uid 1002) · **PM2:** `pm2-artenojardim.service`

> Migrado da VPS antiga (`23.29.114.96`, Ubuntu 22.04) em **30/09/2026**. A antiga segue de pé
> com código e banco intactos, processos parados, como rollback.

> Esta VPS é **compartilhada** com o **placeadmin** (a produção crítica da máquina) e o
> **financee**. O isolamento é por usuário: cada app tem seu usuário de sistema, seu PM2
> (unit systemd própria), sua deploy key do GitHub e seu role no Postgres. **Nunca** rode
> `pm2` sem o atalho do usuário certo, e **sempre** `nginx -t` antes de qualquer reload.

## Atalhos de root

| Atalho | Roda como | Exemplo |
|---|---|---|
| `aj` | `artenojardim` | `aj pm2 ls` · `aj 'cd /var/www/artenojardim && git pull'` |
| `pa` | `placeadmin` | (do outro projeto — não use) |
| `fa` | `financee` | (do outro projeto — não use) |

Os três carregam o Node do NVM do usuário. `aj` e `fa` rodam com `nice -n 10`: a VPS é do
placeadmin e os convidados cedem CPU.

## Mapa de portas (confira antes de mudar qualquer porta)

| Porta | Dono |
|---|---|
| 3000 / 3001 / 3002 | Next do **placeadmin** |
| 3333 | API do **placeadmin** |
| **4000** | **Grafana** — era a porta da nossa API na VPS antiga |
| 3020 / 4010 | web / api do **financee** |
| **3010 / 3011 / 4020** | **nossos**: store / admin / api |
| 5432 · 5672 · 6379 · 9090 · 9100 · 9113 · 9187 · 9428 · 15672 | Postgres, Rabbit, Redis, monitoramento |

> **A API mudou de 4000 para 4020 na migração.** Subir na 4000 derruba o Grafana do
> placeadmin. A porta vai explícita no `ecosystem.config.cjs` (`env: { PORT: '4020' }`),
> porque o default do código ainda é 4000. Dono de uma porta:
> `ss -lptnH "sport = :<porta>"` e `ls -l /proc/<pid>/cwd` — o `cwd` é o que distingue
> projetos, já que `next-server` é idêntico entre eles.

## Deploy key do GitHub

O root **não** tem chave do GitHub — de propósito. Cada app usa a sua, com um alias de host:

```
Host github-artenojardim
    HostName github.com
    User git
    IdentityFile /home/artenojardim/.ssh/artenojardim_deploy
    IdentitiesOnly yes
```

O remote é `git@github-artenojardim:julianoferrasso/artenojardim.git` — **não** `git@github.com:`.
Um `git clone git@github.com:...` como root dá `Permission denied (publickey)`, e a causa não é a
chave do seu perfil: é que o root não tem chave privada nenhuma. A chave é uma **Deploy Key do
repositório**, somente leitura.

`IdentitiesOnly yes` importa: sem isso o SSH oferece todas as chaves do agente e o GitHub
autentica pela primeira que reconhecer — possivelmente a do app errado.

## Isolamento no Postgres

Em 30/09/2026 o `CONNECT` herdado do `PUBLIC` foi revogado nos bancos `placeadmin` e `finance`
(eles nasceram com ACL default, então **qualquer** role do cluster conectava em **qualquer**
banco — inclusive `finance_app` no `placeadmin` e vice-versa). Os acessos legítimos foram
concedidos explicitamente **antes** do revoke, na mesma transação:

| Banco | Roles com CONNECT |
|---|---|
| `placeadmin` | `api_user` (dono), `backup_user`, `exporter` |
| `finance` | `finance_app` (dono), `backup_user`, `exporter` |
| `artenojardim` / `artenojardim_shadow` | `artenojardim` |

`backup_user` conecta por **TCP com senha** (`/root/.pgpass`) e precisa do CONNECT explícito —
sem ele o backup diário do placeadmin para em silêncio. O `pg_restore_check` usa
`sudo -u postgres` (superuser, imune a ACL) e não entra na lista.

Teste de isolamento (esperado `f`):

```bash
sudo -u postgres psql -tAc "SELECT has_database_privilege('artenojardim','placeadmin','CONNECT');"
```

## Backup

Systemd timer (não cron, como na VPS antiga): `artenojardim-backup.timer`, 06:30 UTC —
fora do `pg-backup` (~03:13) e do `pg-restore-check` (~04:39) do placeadmin e do
`financee-backup` (05:30), para não disputar disco. Script:
`/usr/local/bin/artenojardim_backup.sh`, retenção 14 dias em `/var/backups/artenojardim`.
Valida o próprio dump (tamanho mínimo + `pg_restore --list`) e falha de verdade.

> **Pendência:** os dumps ficam na mesma VPS do banco. Falta cópia off-site.

---


## Deploy

O passo a passo vive no [README](../README.md#deploy). Este bloco tinha
`pm2 reload ecosystem.config.cjs`, o que está **errado**:
- o `reload` serve o `.next` antigo nos apps Next e não troca o código do worker (ver abaixo);
- o `reload` sem nome de processo atinge o ecosystem inteiro, quando cada processo pede um
  comando diferente.

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
> **Porta 3000 é do placeadmin** nesta VPS (era do `rag_sefaz` na antiga). Não use.
> Veja o mapa de portas no topo deste documento.

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

**HTTP/2 — atenção, a regra INVERTEU na VPS nova.** Na antiga (nginx 1.18) era
`listen 443 ssl http2;`. Aqui (1.26) o parâmetro `http2` no `listen` liga o HTTP/2 **no
socket** — ou seja, em TODOS os sites da 443, inclusive os do placeadmin, que rodam
HTTP/1.1. O vhost usa `listen 443 ssl;` **sem `http2`**, e sem `http2 on;` também.
Mudar a versão do protocolo da produção alheia não é efeito colateral que se cause de passagem.

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

### Backfill que se roda de novo depois do deploy

Migration que **copia** dado do formato antigo para o novo tem uma janela: entre o
`migrate deploy` e o restart da API, o código antigo ainda grava no formato antigo. Essas
migrations são escritas idempotentes (`ON CONFLICT DO NOTHING`, id derivado da origem) e o
bloco de backfill é rodado de novo, à mão, depois do restart:

- `20261019120000_support_threads` — mensagens e pedidos de cancelamento que viviam em
  `OrderEvent` viram `SupportThread`/`SupportMessage` e `Order.cancelRequestedAt`. Rodar de
  novo o trecho abaixo de `-- ── Backfill` do `migration.sql`
  (`sudo -u postgres psql -d artenojardim -f <arquivo com o trecho>`).

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
   ban progressivo até 1 semana). `ignoreip` cobre `191.57.0.0/16` e `179.35.0.0/16` —
   as faixas do ISP residencial (Vivo). **A faixa, não o IP:** um IP residencial é dinâmico,
   e quando ele mudou no meio de uma sessão instável, o novo IP acumulou falhas de auth e a
   jail baniu com `iptables` em **todas** as portas — o que parece um outage total da VPS
   (ICMP, 80, 443, tudo em timeout) e não um ban. O reboot limpa os bans (não persistem),
   mas isentar a faixa evita a reincidência sem abrir o SSH, já que a chave segue sendo a
   única entrada. Se perder acesso e a VPS responder para nós externos mas não para você,
   suspeite disto antes de suspeitar de outage.
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

## No ar (19/07/2026)

Os três domínios respondem pela internet com TLS válido:

- `https://artenojardim.com.br` — loja
- `https://api.artenojardim.com.br` — API (`/health` → `database: up`)
- `https://admin.artenojardim.com.br` — painel (login OWNER verificado end-to-end)

O certificado `artenojardim.com` foi **expandido** (não recriado) para os 6 nomes, via
`certbot certonly --webroot -w /var/www/html --cert-name artenojardim.com --expand -d ...`.
Válido até 17/10/2026, renovação automática pelo `certbot.timer`. O login funciona entre
subdomínios porque o cookie de refresh é `Domain=.artenojardim.com.br; Secure; HttpOnly`.

Deploy de atualização (o fluxo padrão daqui pra frente): `git pull` → `pnpm install
--frozen-lockfile` → `build:shared` → `pnpm -r build` → `prisma migrate deploy` →
recarregar os processos.

> **`restart`, não `reload`, para os apps Next.** O `next start` lê o `.next` uma vez,
> no boot; `pm2 reload` faz graceful restart e NÃO relê o build, servindo o `.next`
> antigo — rotas novas dão 404 e as antigas funcionam (o sintoma que confunde). A API
> (Express) pode usar reload. Os fronts precisam de `pm2 restart artenojardim-store
> artenojardim-admin`.

> **dev e produção compartilham o MESMO banco.** Rodar `migrate dev` da máquina local
> já aplica na base de produção — por isso `migrate deploy` no deploy costuma dizer
> "No pending migrations". OK para uma loja/dev solo; quando houver staging, separar.

## Backup (19/07/2026)

> **Na VPS atual (179.199.150.80) isto mudou.** O backup é
> `/usr/local/bin/artenojardim_backup.sh`, disparado pelo `artenojardim-backup.timer` do
> systemd às 06:30 UTC; dumps em `/var/backups/artenojardim/`, 14 dias. Os comandos
> `artenojardim-pg-backup`/`artenojardim-pg-restore` e o cron abaixo **não existem** nela — o
> restore é `pg_restore` manual (ver README, seção Backup). O texto abaixo é o histórico da VPS antiga.

`pg_dump` diário do banco `artenojardim` (nunca toca `rag_sefaz`), agendado no
cron para **03:17**. Scripts versionados em `scripts/`, instalados na VPS:

```
/usr/local/bin/artenojardim-pg-backup    # dump -Fc, retenção 14 dias
/usr/local/bin/artenojardim-pg-restore   # restaura p/ banco de TESTE por padrão
/etc/cron.d/artenojardim-backup          # 17 3 * * *  (MAILTO=root)
/var/backups/artenojardim/*.dump         # 700 postgres:postgres, dumps 600
/var/log/artenojardim-backup.log         # saída do cron
```

O backup **valida a si mesmo**: recusa dump vazio e confere que o `pg_restore`
lê o header — pega corrupção antes de o arquivo virar o único backup restante.
Falha com exit ≠ 0, e o cron manda e-mail ao root.

**O restore foi TESTADO**, não presumido: restaurei um dump num banco temporário
e conferi as contagens de linha. Refazer o teste a qualquer momento:

```bash
artenojardim-pg-restore /var/backups/artenojardim/<arquivo>.dump
# restaura em artenojardim_restore_test; para produção, passe o nome dela de propósito.
```

### Ainda falta: cópia off-site

Os dumps vivem na **mesma VPS** que o banco. Isso cobre o comum — DROP
acidental, migration ruim, corrupção — mas **se a VPS for perdida por inteiro, o
backup vai junto.**

O bloqueio sumiu: com o S3 configurado (arquitetura §13) a conta e as credenciais
existem. O que falta é o passo no `pg-backup.sh` que copia o dump para lá.
**Não reutilize o bucket de mídia nem o usuário IAM da API** — o bucket de mídia é
público para leitura em `store/*` e o usuário da API só tem permissão nesse prefixo,
de propósito. Backup pede bucket **privado próprio**, com versionamento e lifecycle.

## RabbitMQ (12/08/2026)

Instalado do repositório do Ubuntu (`rabbitmq-server`, com Erlang junto). O `rag_sefaz` **não**
usa broker — as portas estavam livres, então não houve conflito.

```
vhost   artenojardim        produção (a API e o worker usam este)
vhost   artenojardim_dev    dev pelo túnel SSH — NÃO aponte dev para o de produção,
                            senão a sua máquina consome mensagens reais
user    artenojardim        senha aleatória, permissões só nos dois vhosts acima
```

**Três decisões que valem lembrar:**

- **Escuta só em `127.0.0.1`** (`listeners.tcp.local` e `management.tcp.ip` no
  `/etc/rabbitmq/rabbitmq.conf`). O default é `0.0.0.0`, e depender só do UFW seria uma camada
  única — a mesma razão pela qual a 5432 foi fechada na auditoria de 16/07. **Não abra 5672
  nem 15672 no UFW**; o painel vai por túnel SSH:
  `plink -i C:\Users\2cta\.ssh\ed_25519-hostinger.ppk -L 15672:127.0.0.1:15672 root@179.199.150.80`
  → `http://localhost:15672`. **O RabbitMQ é compartilhado:** nosso vhost é `artenojardim`;
  o vhost `/` é do placeadmin.
- **`vm_memory_high_watermark.relative = 0.2`** e não o default de 0.4. Com 3.9 GB, o default
  deixaria o broker se achar dono de 1.6 GB numa VPS compartilhada.
- **O usuário `guest` foi removido.** Ele entra sem senha pelo loopback e teria acesso a tudo.

### Topologia (declarada pelo código, no boot da API e do worker)

5 filas + 15 de retry + 5 DLQ, nos exchanges `ecommerce.events` e `ecommerce.dlx`. As DLQ
**não têm consumidor de propósito**: mensagem parada lá é bug, e bug se corrige. Alerta quando
qualquer uma passar de 0:

```bash
rabbitmqctl list_queues -p artenojardim name messages | grep dlq
```

`shipping.label` e `shipping.tracking` existem declaradas mas sem consumidor — ninguém publica
nelas ainda (Fase 16).

### O worker

`artenojardim-worker` no PM2 (`apps/api/dist/worker.js`), processo separado da API. **Nunca
cluster:** N instâncias = N× o `prefetch` e N× a vazão contra o limite do SES.

> **`pm2 reload` não recarrega o worker.** No deploy da correção de idempotência, o `reload`
> devolveu ✓ mas o processo seguiu com o código antigo (uptime não zerou). Use
> `pm2 restart artenojardim-worker` e **confira o uptime** — é como saber que pegou.

Sem broker, a API sobe normalmente: `/health` responde `queue: "off"` e publicar devolve 503.
A loja continua vendendo; só o e-mail espera.

## Storage de mídia (AWS S3)

Produção roda `STORAGE_DRIVER=s3`. **A VPS não está no caminho da imagem**: o browser
faz PUT direto no bucket com URL assinada, e a loja lê direto do bucket. O Nginx nunca
serviu mídia — quem servia era um `express.static` dentro do processo Node, e ele só
roda quando o driver é `local` (desenvolvimento).

- Bucket **`artenojardimbucket`**, público para leitura só no prefixo `store/*`
  (bucket policy). Escrita apenas por URL assinada de 5 min.
- Usuário IAM **próprio, separado do usuário do SES**: `PutObject`/`GetObject`/
  `DeleteObject` em `store/*` e **`ListBucket`** no bucket. O `ListBucket` não é
  opcional — sem ele o S3 devolve 403 em vez de 404 numa key inexistente e o confirm
  de upload responde 502 no lugar do 422.
- **CORS do bucket** precisa listar o domínio do admin (`AllowedMethods: [PUT]`,
  `AllowedHeaders: [Content-Type]`). Domínio de admin novo sem entrada no CORS = upload
  quebra só em produção, com erro apenas no console do browser.

> ⚠️ **`NEXT_PUBLIC_CDN_HOST` é inlined no BUILD.** Trocar o host das imagens exige
> `pnpm build` nos apps Next — editar o `.env` e dar `pm2 restart` **não** surte efeito.
> É o erro mais provável do próximo deploy que mexer nisso.

## Incidente: 9 dias fora do ar (20–29/08/2026)

A loja e o admin ficaram inacessíveis de **20/08 06:05 até 29/08 20:41**. Os apps estavam
todos de pé o tempo inteiro (store 3010 e admin 3011 devolvendo 200 no `localhost`). Quem
tinha morrido era o **Nginx**, e nada em 80/443.

A causa foi **corrupção silenciosa de arquivos do sistema base em disco**. Oito arquivos
ficaram com o cabeçalho ELF intacto mas o miolo podre — o `file` não reclamava, e o crash
acontecia dentro do próprio `ld.so` (`segfault at 8 in ld-linux-x86-64.so.2`). Entre eles,
os dois que importam:

- **`libpcre.so.3.13.3`** — o `/usr/sbin/nginx` linka essa lib, então **toda** invocação do
  nginx segfaltava, até `nginx -v`. O binário do nginx estava íntegro.
- **`/bin/dash`**, que é o `/bin/sh`.

A queda em si: o `unattended-upgrade` atualizou o nginx (`14.18` → `14.20`), o `postinst`
rodou `nginx -t`, aquilo segfaltou, o dpkg abortou — e o nginx parou sem nunca mais subir.
Caíram junto os outros dois sites da VPS.

### O diagnóstico que encurta o caminho

**`dpkg -V`** confere o md5 de todo arquivo empacotado do sistema. Saída vazia = tudo íntegro;
linhas com `??5??????` são arquivos que divergem do pacote. Foi o comando que fechou o caso
em um passo, depois de o `nginx -v`, o `grep` e o `ldconfig -p` estarem todos segfaltando.
Quando **binários sem relação entre si** começam a segfaltar, não procure o bug em cada um:
procure a **biblioteca compartilhada** entre eles (`ldd`), ou rode `dpkg -V` direto.

### A armadilha do reparo

> ⚠️ **Com o `/bin/sh` quebrado, `apt-get install --reinstall` não conserta nada** — todo
> `postinst` do dpkg roda sob `/bin/sh`. Pior: naquele estado o **próprio `apt-get`
> segfaltava**, então nem `apt-get download` funcionava.

O caminho que funciona, sem depender de shell nenhum:

1. Resolver a URL e o SHA256 dos `.deb` lendo `/var/lib/apt/lists/*_Packages` (com `python3`
   ou `awk` — o `grep` estava morto), baixar com `curl`, conferir com `sha256sum -c`.
2. Extrair com `dpkg-deb -x` (usa tar, não shell).
3. Trocar cada arquivo com **rename atômico** (`os.replace`), **nunca `cp` por cima**: `cp`
   trunca o inode e derruba todo processo que tenha a `.so` mapeada. Bibliotecas primeiro,
   depois o `dash`. Rodar `ldconfig` no fim.
4. Só então `dpkg --configure -a` e `apt-get install --reinstall` para o dpkg voltar a
   concordar com o disco.

Cuidado ao montar a lista de alvos: `/bin` e `/lib` são symlinks para `/usr/bin` e `/usr/lib`
(merged-`/usr`), e o pacote traz **o symlink e o arquivo versionado**. Troque só o arquivo
real (`libpcre.so.3.13.3`), nunca o symlink (`libpcre.so.3`).

Um `linux-image` também tinha ficado meio-configurado (`iF`) desde 21/08 — ou seja,
**initramfs e grub estavam desatualizados e a VPS não podia reiniciar em segurança**.
O `dpkg --configure -a` resolveu junto. Vale sempre conferir o `dpkg --audit` antes de
qualquer reboot.

### A vítima silenciosa: o backup parou junto

**O cron executa tudo via `/bin/sh`.** Com o dash quebrado, morreu todo job agendado — e o
mais caro foi o `/etc/cron.d/artenojardim-backup`: o último dump é de **21/08**, oito dias
sem backup, e ninguém soube. O log em `/var/log/artenojardim-backup.log` termina no dia 21
sem nenhuma linha de erro, porque o job nem chegou a começar.

Lição: **`/bin/sh` quebrado não derruba só o que você vê**. Depois de consertar, rode os jobs
de cron na mão para conferir que voltaram, em vez de esperar o próximo horário.

### Patches aplicados no mesmo dia (29/08/2026)

Com o dpkg destravado, os 26 pacotes represados desde 20/08 foram aplicados. Uma distinção
que vale guardar — **o `unattended-upgrades` só cobre origens Ubuntu**:

```
"${distro_id}:${distro_codename}";  "${distro_id}:${distro_codename}-security";
"${distro_id}ESMApps:...";          "${distro_id}ESM:...";
```

Ou seja: **pgdg (Postgres) e nodesource (Node) nunca são atualizados sozinhos** — e
`jammy-updates` também não está na lista. Não conte com o automático para eles.

Resultado: Postgres 16.14 → **16.15**, Node 24.18 → **24.19**, mais os patches de segurança.
Antes de tocar no Postgres, dump `-Fc` dos **dois** bancos do cluster (o restart afeta o
`rag_sefaz` do outro projeto também) em `/var/backups/prepatch/`, cada um verificado com
`pg_restore --list`.

> ⚠️ **`NEEDRESTART_MODE=a` reinicia o `pm2-root.service`.** Setar isso para o `needrestart`
> não travar num prompt custou ~1 minuto de 502 em **todos** os apps da VPS, os do outro
> projeto inclusive. Se a queda importar, use `NEEDRESTART_MODE=l` (só lista) e reinicie o
> que você escolher, na hora que você escolher.

O reboot para o kernel `5.15.0-190` foi feito no mesmo dia. **Tudo voltou sozinho**, e vale
saber disso antes do próximo:

- `systemctl reboot` (ou `reboot`, ou `shutdown -r now` — no systemd é a mesma coisa). Para o
  comando retornar antes de a conexão cair:
  `systemd-run --on-active=3 systemctl reboot`.
- Todos os serviços estão `enabled`: nginx, postgresql, rabbitmq-server, ssh, cron.
- O PM2 sobe pelo `pm2-root.service`, com `ExecStart=pm2 resurrect`, que lê
  `/root/.pm2/dump.pm2`. **Confira o dump antes de reiniciar** — é ele, e não o estado atual,
  que define o que volta. O `insightia` está gravado como `stopped` e continua parado, que é
  o correto. Não rode `pm2 save` sem querer: ele sobrescreve o dump com o estado do momento.
- O `artenojardim-worker` reinicia **uma vez** no boot (↺ 1) e estabiliza: ele nasce antes do
  RabbitMQ estar pronto e se recupera sozinho. Não é defeito.
- A VPS levou menos de 30 segundos para aceitar SSH de novo.

Checagem antes de qualquer reboot: `dpkg --audit` vazio, o `initrd.img` do kernel novo
existindo em `/boot`, e `GRUB_DEFAULT=0` com a primeira entrada do menu apontando para ele.

### O que ficou de proteção

- `/etc/systemd/system/nginx.service.d/restart.conf` com `Restart=on-failure` e
  `RestartSec=10s`. Não cobre falha de config (o `-t` do `ExecStartPre` aborta antes), mas
  cobre crash em runtime e OOM.
- Backups dos arquivos corrompidos e os `.deb` originais em `/root/repair/`.

O disco foi lido inteiro depois (`dd if=/dev/vda1 of=/dev/null`, 43 GB a 1,2 GB/s) sem um
único erro de I/O, e o filesystem estava `clean`. Nada aponta para hardware — foi evento
pontual, provavelmente do lado do host.

**A lição real não é técnica.** Nove dias fora do ar porque ninguém percebeu. Falta um
monitor externo batendo em `https://artenojardim.com.br/` e em
`https://api.artenojardim.com.br/api/v1/health` — é o item que teria transformado nove dias
em nove minutos.

## Pendências

**Monitor externo de uptime.** Ver o incidente de 20–29/08 acima. Enquanto não existir,
a loja pode cair de novo e só descobrirmos por acaso.

**A senha do banco é fraca.** `@rteNoJardim!` é o nome da marca com leetspeak — cai em
ataque de dicionário. Enquanto a 5432 estava aberta isso era urgente; com ela fechada, o
risco caiu muito. Ainda assim, vale trocar por uma senha aleatória antes de a loja entrar
no ar (`openssl rand -base64 32`), atualizando o `.env`.

**Cópia off-site do backup.** Os dumps vivem na mesma VPS que o banco (ver seção Backup):
cobre DROP/migration ruim, mas não a perda da VPS inteira. Não depende mais de credencial —
falta o passo no `pg-backup.sh`, num bucket privado próprio (não o da mídia).

**~~Job de liberação de reserva de estoque~~ — resolvido (out/2026).** `jobs/release-reservations`
roda no worker a cada 5 min e cancela o pedido não pago cuja reserva venceu (regras em
`docs/arquitetura.md`, "Reserva ≠ movimento"). Como roda no worker, mudança nele pede
`pm2 restart artenojardim-worker`.

**~~SES em sandbox~~ — resolvido.** Conferido em 18/10/2026 pela API do SES (`GetAccount`):
`ProductionAccessEnabled: true`, cota de 50 mil e-mails/dia, `EnforcementStatus: HEALTHY`. O envio
para qualquer destinatário funciona.

## Backups da configuração

Tudo que foi alterado tem cópia com timestamp na VPS:

- `/etc/ssh/sshd_config.bak-20260716-172722`
- `/etc/ssh/sshd_config.d/*.conf.bak-*`
- `/etc/postgresql/16/main/pg_hba.conf.bak-20260716-174415`
