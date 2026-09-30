/**
 * PM2 — processos de produção.
 *
 * .cjs e não .js: o package.json da raiz declara "type": "module", e o PM2 lê
 * este arquivo com require().
 *
 * Prefixo `artenojardim-` em TODO nome: esta VPS (179.199.150.80) é
 * compartilhada com o PLACEADMIN (produção crítica) e o financee. Cada app tem
 * usuário e PM2 próprios (units systemd separadas), então na prática os
 * processos nem se enxergam — mas o prefixo continua, porque um `pm2 restart
 * api` no daemon errado derrubaria a produção alheia.
 *
 * Este ecosystem roda no PM2 do usuário `artenojardim`
 * (unit `pm2-artenojardim.service`). Comandos pelo atalho `aj`, como root:
 *   aj pm2 ls
 *   aj "cd /var/www/artenojardim && pm2 restart artenojardim-store"
 *
 * ── PORTAS: store 3010 · admin 3011 · api 4020 ──────────────────────────────
 * O mapa real da VPS:
 *   3000/3001/3002 Next do placeadmin · 3333 API dele · 4000 GRAFANA
 *   3020/4010 financee · 3010/3011/4020 nossas
 * A API usava 4000 na VPS ANTIGA; aqui isso derrubaria o Grafana. Por isso o
 * PORT vai explícito no env abaixo — o default do código ainda é 4000.
 * Antes de mudar qualquer porta, confira o dono:
 *   ss -lptnH "sport = :<porta>"  e  ls -l /proc/<pid>/cwd
 * O cwd é o que identifica o projeto: `next-server` é idêntico entre eles.
 *
 * ── DEPLOY: `restart`, não `reload`, para os apps Next ──────────────────────
 * O `next start` lê o diretório `.next` UMA vez, no boot. `pm2 reload` faz um
 * graceful restart que reaproveita o processo e NÃO relê o build — então um
 * deploy com reload serve o `.next` antigo, e as rotas novas dão 404 enquanto
 * as antigas funcionam (o sintoma que confunde). Use:
 *
 *   pm2 restart artenojardim-store artenojardim-admin   # relê o .next novo
 *   pm2 reload  artenojardim-api                        # a API é Express, reload ok
 *   pm2 reload  artenojardim-worker                     # Node puro, reload ok
 *
 * Na PRIMEIRA subida do worker, `reload` não serve (o processo não existe):
 *   pm2 start ecosystem.config.cjs --only artenojardim-worker && pm2 save
 *
 * A API pode usar reload (o dist/server.js é relido no restart do processo, e
 * ela não tem o cache de build do Next). Os fronts precisam de restart.
 *
 * ── TZ=UTC é deliberado, NÃO esqueceram de trocar ───────────────────────────
 * Fixado em UTC de propósito, e não em America/Sao_Paulo. O relógio do processo
 * já era UTC (é a imagem da VPS); declará-lo transforma acidente em invariante,
 * e mantém produção e teste (vitest.config.ts) idênticos.
 *
 * Pôr America/Sao_Paulo aqui seria pior que inútil: nenhuma fronteira de dia
 * depende de `process.env.TZ` — todas nomeiam o fuso via
 * packages/shared/src/utils/date-br.ts. A env só criaria divergência com o CI
 * e convidaria alguém a escrever `new Date().getDate()` achando que está certo.
 *
 * Mudar TZ exige `pm2 restart --update-env`: `reload` não recarrega o ambiente.
 */
module.exports = {
  apps: [
    {
      name: 'artenojardim-api',
      cwd: '/var/www/artenojardim/apps/api',
      script: 'dist/server.js',

      // Fork e não cluster, por ora. O doc prevê cluster (N = núcleos), e é o
      // destino — mas a VPS é compartilhada com 3 apps de outro projeto, e
      // clusterizar antes de existir tráfego só consome RAM alheia. Vira
      // `exec_mode: 'cluster', instances: 2` quando houver carga que peça.
      // O rate limit já está no Postgres, então cluster não quebra nada.
      exec_mode: 'fork',
      instances: 1,

      // --env-file-if-exists: o .env é a fonte em produção (chmod 600), mas se
      // um dia o ambiente vier do PM2, a ausência do arquivo não derruba o boot.
      node_args: '--env-file-if-exists=.env',

      // PORT explicito: o default do codigo e 4000, que NESTA VPS e o Grafana
      // do placeadmin. Mudar porta exige `pm2 restart --update-env`.
      env: { TZ: 'UTC', PORT: '4020' },

      max_memory_restart: '400M',
      autorestart: true,
      // Sem isto, um crash em loop reinicia para sempre e esconde o problema.
      max_restarts: 10,
      min_uptime: '20s',
      restart_delay: 2000,

      error_file: '/var/log/artenojardim/api-error.log',
      out_file: '/var/log/artenojardim/api-out.log',
      time: true,
    },
    {
      // Consumidores do RabbitMQ (e-mail de pedido e campanhas de marketing).
      // Processo SEPARADO da API porque a API pode virar cluster: se virasse,
      // cada instância abriria um consumidor e o prefetch(1) viraria prefetch(N)
      // — junto com N vezes a taxa de envio contra o limite do SES.
      //
      // Aceita `reload` como a API: é Node puro, sem o cache de build do Next.
      name: 'artenojardim-worker',
      cwd: '/var/www/artenojardim/apps/api',
      script: 'dist/worker.js',

      // NUNCA cluster. Ver acima: N instâncias = N× o prefetch e N× a vazão.
      exec_mode: 'fork',
      instances: 1,

      node_args: '--env-file-if-exists=.env',
      env: { TZ: 'UTC' },

      // Menor que o da API: o worker não serve requisição, e uma campanha que
      // engorda a heap deve matar só ele — nunca a loja.
      max_memory_restart: '300M',
      autorestart: true,
      max_restarts: 10,
      min_uptime: '20s',
      // Maior que o da API: se o broker estiver fora, reiniciar em rajada só
      // enche o log. O backoff da reconexão já cobre a janela curta.
      restart_delay: 5000,

      error_file: '/var/log/artenojardim/worker-error.log',
      out_file: '/var/log/artenojardim/worker-out.log',
      time: true,
    },
    {
      name: 'artenojardim-store',
      cwd: '/var/www/artenojardim/apps/store',
      // pnpm e não `next`: o binário do next vive no store do pnpm, num caminho
      // com hash que muda a cada install. `pnpm start` resolve isso sozinho.
      script: 'pnpm',
      // Sem o `--`: o pnpm o repassaria literalmente e o next leria '--hostname'
      // como diretorio do projeto. Sem ele, o pnpm anexa o flag ao script.
      // O flag e a unica via: o Next 16 nao le a env HOSTNAME (no --help, so o
      // --port declara 'env: PORT').
      args: 'start --hostname 127.0.0.1',
      interpreter: 'none',

      exec_mode: 'fork',
      instances: 1,
      // 3000 é do rag_sefaz/web. Colidir derrubaria o outro projeto.
      env: { NODE_ENV: 'production', PORT: '3010', TZ: 'UTC' },

      max_memory_restart: '500M',
      autorestart: true,
      max_restarts: 10,
      min_uptime: '20s',

      error_file: '/var/log/artenojardim/store-error.log',
      out_file: '/var/log/artenojardim/store-out.log',
      time: true,
    },
    {
      name: 'artenojardim-admin',
      cwd: '/var/www/artenojardim/apps/admin',
      script: 'pnpm',
      // Sem o `--`: o pnpm o repassaria literalmente e o next leria '--hostname'
      // como diretorio do projeto. Sem ele, o pnpm anexa o flag ao script.
      // O flag e a unica via: o Next 16 nao le a env HOSTNAME (no --help, so o
      // --port declara 'env: PORT').
      args: 'start --hostname 127.0.0.1',
      interpreter: 'none',

      exec_mode: 'fork',
      instances: 1,
      env: { NODE_ENV: 'production', PORT: '3011', TZ: 'UTC' },

      max_memory_restart: '400M',
      autorestart: true,
      max_restarts: 10,
      min_uptime: '20s',

      error_file: '/var/log/artenojardim/admin-error.log',
      out_file: '/var/log/artenojardim/admin-out.log',
      time: true,
    },
  ],
}
