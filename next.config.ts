import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Raise proxy body limit for large CSV uploads (default 4 MB)
    proxyClientMaxBodySize: "50mb",
  },
};

export default nextConfig;
