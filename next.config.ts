import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export", // static export -> ./out, deployable as static assets on Cloudflare
  images: { unoptimized: true },
};

export default nextConfig;

import('@opennextjs/cloudflare').then(m => m.initOpenNextCloudflareForDev());
