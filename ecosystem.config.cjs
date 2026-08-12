/**
 * PM2 — processos de produção.
 *
 * .cjs e não .js: o package.json da raiz declara "type": "module", e o PM2 lê
 * este arquivo com require().
 *
 * Prefixo `artenojardim-` em TODO nome: esta VPS é compartilhada com outro
 * projeto, que já usa `api`, `web` e `ai-service` no PM2. Um `pm2 restart api`
 * distraído derrubaria a produção alheia.
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

      env: { TZ: 'UTC' },

      max_memory_restart: '400M',
      autorestart: true,
      // Sem isto, um crash em loop reinicia para sempre e esconde o problema.
      max_restarts: 10,
      min_uptime: '20s',
      restart_delay: 2000,

      error_file: '/var/www/artenojardim/logs/api-error.log',
      out_file: '/var/www/artenojardim/logs/api-out.log',
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

      error_file: '/var/www/artenojardim/logs/worker-error.log',
      out_file: '/var/www/artenojardim/logs/worker-out.log',
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

      error_file: '/var/www/artenojardim/logs/store-error.log',
      out_file: '/var/www/artenojardim/logs/store-out.log',
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

      error_file: '/var/www/artenojardim/logs/admin-error.log',
      out_file: '/var/www/artenojardim/logs/admin-out.log',
      time: true,
    },
  ],
}
