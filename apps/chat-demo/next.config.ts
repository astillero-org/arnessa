import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@arnessa/react"]
};

// @ts-ignore
nextConfig.allowedDevOrigins = ['127.0.0.1'];

export default nextConfig;
