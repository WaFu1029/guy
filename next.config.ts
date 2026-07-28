import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    // The capture flow moved to the Log tab.
    return [{ source: "/capture", destination: "/log", permanent: false }];
  },
};

export default nextConfig;
