import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // OpenNext Cloudflare worker deployment (see wrangler.jsonc) — no output
  // override; OpenNext builds the standalone server bundle itself.
  images: { unoptimized: true },
};

export default nextConfig;

import('@opennextjs/cloudflare').then(m => m.initOpenNextCloudflareForDev());
