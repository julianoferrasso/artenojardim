# VPS — estado e decisões de infraestrutura

**Host:** `23.29.114.96` · Ubuntu 22.04.5 LTS · PostgreSQL 16.14
**Acesso:** `root` por chave (`placeadmin_vps.ppk`, formato PuTTY)

> Esta VPS é **compartilhada** com outro projeto (`rag_sefaz` + apps `api`/`web`/`ai-service`
> no PM2). Toda mudança aqui foi feita com `reload` em vez de `restart` justamente para não
> derrubar as conexões deles. **Continue nesse cuidado.**

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
