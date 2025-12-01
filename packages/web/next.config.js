/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@nodeprism/shared'],
  // Disable static exports since app requires authentication
  output: 'standalone',
  env: {
    API_URL: process.env.API_URL || 'http://localhost:4000',
  },
  // Disable static generation for all pages (requires dynamic data)
  experimental: {
    // This ensures pages are not statically generated during build
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
