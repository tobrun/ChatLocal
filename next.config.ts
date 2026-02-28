import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Custom server handles routing; Next.js only handles page rendering
  serverExternalPackages: ["better-sqlite3"],
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
