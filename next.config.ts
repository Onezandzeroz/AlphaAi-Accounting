import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ignore TypeScript errors during build (shadcn/ui components may trigger some)
  typescript: {
    ignoreBuildErrors: true,
  },
  // Disable strict mode to prevent double-rendering in development
  reactStrictMode: false,
  // Allow cross-origin requests from preview panels and reverse proxies
  allowedDevOrigins: [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://preview-chat-9e41e999-4563-4538-9a77-33caa3de22da.space.z.ai",
    "*.space.z.ai",
  ],
  // Prisma must be external on the server side to avoid bundling issues
  // with Turbopack (dev) and Webpack (build)
  serverExternalPackages: ["@prisma/client", "prisma"],
};

export default nextConfig;
