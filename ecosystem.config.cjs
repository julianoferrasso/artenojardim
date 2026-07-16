/**
 * PM2 — processos de produção.
 *
 * .cjs e não .js: o package.json da raiz declara "type": "module", e o PM2 lê
 * este arquivo com require().
 *
 * Prefixo `artenojardim-` em TODO nome: esta VPS é compartilhada com outro
 * projeto, que já usa `api`, `web` e `ai-service` no PM2. Um `pm2 restart api`
 * distraído derrubaria a produção alheia.
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
      name: 'artenojardim-store',
      cwd: '/var/www/artenojardim/apps/store',
      // pnpm e não `next`: o binário do next vive no store do pnpm, num caminho
      // com hash que muda a cada install. `pnpm start` resolve isso sozinho.
      script: 'pnpm',
      args: 'start',
      interpreter: 'none',

      exec_mode: 'fork',
      instances: 1,
      // 3000 é do rag_sefaz/web. Colidir derrubaria o outro projeto.
      env: { NODE_ENV: 'production', PORT: '3010' },

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
      args: 'start',
      interpreter: 'none',

      exec_mode: 'fork',
      instances: 1,
      env: { NODE_ENV: 'production', PORT: '3011' },

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
