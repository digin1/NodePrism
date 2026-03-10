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
    NEXT_PUBLIC_DOCS_URL: process.env.NEXT_PUBLIC_DOCS_URL || 'http://localhost:3080',
  },
  // Disable automatic trailing slash redirects so proxied tools (AlertManager, Prometheus)
  // can use trailing slashes for relative asset resolution without redirect loops
  skipTrailingSlashRedirect: true,
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
        // Agent install script - served through port 3000 so remote servers can access it
        {
          source: '/agent-install.sh',
          destination: 'http://localhost:4000/agent-install.sh',
        },
        // Grafana - proxied through Next.js so session cookie is present for auth
        {
          source: '/grafana/:path*',
          destination: `http://localhost:${process.env.GRAFANA_PORT || '3030'}/grafana/:path*`,
        },
        // Prometheus - proxied through Next.js (serves at root, external-url=/prometheus/)
        {
          source: '/prometheus/:path*',
          destination: `http://localhost:${process.env.PROMETHEUS_PORT || '9090'}/:path*`,
        },
        // AlertManager - proxied through Next.js (serves at root, prefix stripped)
        {
          source: '/alertmanager/:path*',
          destination: `http://localhost:${process.env.ALERTMANAGER_PORT || '9093'}/:path*`,
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
