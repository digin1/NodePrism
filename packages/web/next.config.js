// Load root .env file
require('dotenv').config({ path: '../../.env' });

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false, // Disabled for dev performance (causes double renders)
  transpilePackages: ['@nodeprism/shared'],
  // Disable static page generation for client-heavy pages
  output: 'standalone',
  env: {
    API_URL: process.env.API_URL || 'http://localhost:4000',
    NEXT_PUBLIC_GRAFANA_URL: process.env.NEXT_PUBLIC_GRAFANA_URL || 'http://localhost:3030',
    NEXT_PUBLIC_PROMETHEUS_URL: process.env.NEXT_PUBLIC_PROMETHEUS_URL || 'http://localhost:9090',
    NEXT_PUBLIC_ALERTMANAGER_URL: process.env.NEXT_PUBLIC_ALERTMANAGER_URL || 'http://localhost:9093',
    NEXT_PUBLIC_RABBITMQ_URL: process.env.NEXT_PUBLIC_RABBITMQ_URL || 'http://localhost:15672',
  },
  // Skip linting during build (handled separately)
  eslint: {
    ignoreDuringBuilds: true,
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:4000/api/:path*',
      },
      {
        source: '/uploads/:path*',
        destination: 'http://localhost:4000/uploads/:path*',
      },
      {
        source: '/health',
        destination: 'http://localhost:4000/health',
      },
    ];
  },
};

module.exports = nextConfig;
