module.exports = {
  apps: [
    {
      name: 'baileys-campaigns',
      script: 'src/index.js',
      interpreter: 'node',
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      min_uptime: '10s',
      out_file: 'logs/out.log',
      error_file: 'logs/error.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      env: {
        NODE_ENV: 'production',
      },
      env_development: {
        NODE_ENV: 'development',
      },
    },
  ],
};
