/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@nodeprism/shared'],
  env: {
    API_URL: process.env.API_URL || 'http://localhost:4000',
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:4000/api/:path*',
      },
      {
        source: '/health',
        destination: 'http://localhost:4000/health',
      },
    ];
  },
};

module.exports = nextConfig;
