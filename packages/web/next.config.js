// Load root .env file
require('dotenv').config({ path: '../../.env' });

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false, // Disabled for dev performance (causes double renders)
  transpilePackages: ['@nodeprism/shared', 'react-markdown', 'remark-gfm', 'mermaid'],
  // Dynamic server rendering - all pages are server-rendered on demand
  // This fixes issues with client components that can't be statically generated
  // Use App Router exclusively (no Pages Router fallback error pages)
  experimental: {
    missingSuspenseWithCSRBailout: false,
  },
  env: {
    API_URL: process.env.API_URL || 'http://localhost:4000',
    NEXT_PUBLIC_GRAFANA_URL: process.env.NEXT_PUBLIC_GRAFANA_URL || 'http://localhost:3030',
    NEXT_PUBLIC_PROMETHEUS_URL: process.env.NEXT_PUBLIC_PROMETHEUS_URL || 'http://localhost:9090',
    NEXT_PUBLIC_ALERTMANAGER_URL: process.env.NEXT_PUBLIC_ALERTMANAGER_URL || 'http://localhost:9093',
  },
  // Skip linting during build (handled separately)
  eslint: {
    ignoreDuringBuilds: true,
  },
  async rewrites() {
    return {
      beforeFiles: [
        // Socket.IO must be proxied before any Next.js route matching
        {
          source: '/socket.io/:path*',
          destination: 'http://localhost:4000/socket.io/:path*',
        },
      ],
      afterFiles: [],
      fallback: [
        // Fallback rewrites - only matched if no Next.js page or API route exists
        // This allows /api/docs to be handled by Next.js API route
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
      ],
    };
  },
};

module.exports = nextConfig;
