/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
      crypto: false,
    };
    return config;
  },
  // Ignore TypeScript errors during build (for development)
  typescript: {
    ignoreBuildErrors: false,
  },
  // Environment variables
  env: {
    NEXT_PUBLIC_SOLANA_NETWORK: process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'devnet',
  },
};

module.exports = nextConfig;
