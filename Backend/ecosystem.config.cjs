// pm2 process definition. Fork mode with a distinct PORT per instance (not
// cluster mode) so nginx can pin each Socket.IO client to one worker; the
// cluster module round-robins connections, which breaks polling handshakes.
//
// Dispatch is already multi-worker safe: it takes a Redis lease per ride and
// re-reads ride status from Mongo before every attempt (see dispatchService.js).
//
// ponytail: instance count hardcoded to the box's 2 vCPUs; bump alongside
// the nginx upstream list when the server grows.
module.exports = {
  apps: [
    {
      name: 'udanx-api',
      script: './server.js',
      instances: 2,
      exec_mode: 'fork',
      increment_var: 'PORT',
      env: {
        NODE_ENV: 'production',
        PORT: 5000,
      },
      autorestart: true,
      watch: false,
      max_memory_restart: '2G',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
  ],
};
