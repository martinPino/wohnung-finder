/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone", // generates .next/standalone — self-contained server for Electron

  // Prevent Next.js from trying to bundle Node-only packages used in API routes
  serverExternalPackages: ["playwright", "playwright-core", "node-cron"],

  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Don't attempt to polyfill Node built-ins on the client side
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        child_process: false,
        net: false,
        tls: false,
        dns: false,
      };
    }
    return config;
  },
};

module.exports = nextConfig;
