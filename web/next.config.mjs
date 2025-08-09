/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    optimizePackageImports: [
      "@solana/web3.js",
      "@solana/wallet-adapter-react",
      "@solana/wallet-adapter-react-ui",
      "@solana/wallet-adapter-phantom",
      "@solana/wallet-adapter-backpack",
      "@solana-mobile/wallet-adapter-mobile",
    ],
  },
};

export default nextConfig;
