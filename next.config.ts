import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Allow up to 50 MB request bodies (default is 4 MB — too small for large CSVs)
    serverBodySizeLimit: "50mb",
  },
};

export default nextConfig;
