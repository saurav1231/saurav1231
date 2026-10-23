// PM2 process file: pm2 start deploy/ecosystem.config.cjs
module.exports = {
  apps: [
    {
      name: 'ayana-api',
      cwd: './server',
      script: 'src/index.js',
      instances: 1, // keep 1: the seat-expiry job runs inside the process
      env: { NODE_ENV: 'production' },
      max_memory_restart: '400M',
      out_file: '../logs/api.out.log',
      error_file: '../logs/api.err.log',
      time: true,
    },
  ],
};
