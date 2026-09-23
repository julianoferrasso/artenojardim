# VPS — estado e decisões de infraestrutura

**Host:** `23.29.114.96` · Ubuntu 22.04.5 LTS · PostgreSQL 16.14 · Node 24.18 · nginx 1.18
**Acesso:** `root` por chave (`placeadmin_vps.ppk`, formato PuTTY)
**Código:** `/var/www/artenojardim` · **Logs:** `/var/www/artenojardim/logs/`

> Esta VPS é **compartilhada** com outro projeto (`rag_sefaz` + apps `api`/`web`/`ai-service`
> no PM2, e `insightia`, parado). Toda mudança aqui foi feita com `reload` em vez de
> `restart` justamente para não derrubar as conexões deles. **Continue nesse cuidado.**

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
  `plink -i chave.ppk -L 15672:127.0.0.1:15672 root@23.29.114.96` → `http://localhost:15672`.
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

**Job de liberação de reserva de estoque.** O checkout (Fase 1.11) reserva estoque ao criar o
pedido PENDING, mas nada varre e libera as reservas vencidas (TTL em `Setting.reservation_ttl_minutes`).
Checkout abandonado prende `reserved` até o job existir (`jobs/release-reservations`, Fase 1.18).

**SES ainda em sandbox.** 200 e-mails/dia e só para endereços verificados um a um. A campanha
de marketing funciona no código, mas falha por destinatário até sair — peça "Production
access" no console da AWS (leva ~24h) antes do primeiro envio real. **É o único bloqueio que
resta para a campanha funcionar de verdade.**

## Backups da configuração

Tudo que foi alterado tem cópia com timestamp na VPS:

- `/etc/ssh/sshd_config.bak-20260716-172722`
- `/etc/ssh/sshd_config.d/*.conf.bak-*`
- `/etc/postgresql/16/main/pg_hba.conf.bak-20260716-174415`
