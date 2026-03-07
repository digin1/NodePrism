module.exports = {
  apps: [
    {
      name: 'nodeprism-api',
      cwd: './packages/api',
      script: 'dist/index.js',
      env: {
        NODE_ENV: 'production',
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
    },
    {
      name: 'nodeprism-web',
      cwd: './packages/web',
      script: 'npx',
      args: 'next start',
      interpreter: 'none',
      env: {
        NODE_ENV: 'production',
      },
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
    },
    {
      name: 'nodeprism-config-sync',
      cwd: './packages/config-sync',
      script: 'dist/index.js',
      env: {
        NODE_ENV: 'production',
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
    },
    {
      name: 'nodeprism-anomaly-detector',
      cwd: './packages/anomaly-detector',
      script: 'dist/index.js',
      env: {
        NODE_ENV: 'production',
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
    },
    {
      name: 'nodeprism-agent',
      cwd: './packages/agent-app',
      script: 'dist/index.js',
      env: {
        NODE_ENV: 'production',
        MANAGER_URL: 'http://localhost:4000',
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '200M',
    },
  ],
};
