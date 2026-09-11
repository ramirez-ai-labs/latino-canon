import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Posters are served from our R2 bucket via the api worker.
    remotePatterns: [{ protocol: "https", hostname: "*.workers.dev" }],
  },
  webpack(config) {
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
};

export default nextConfig;

// OpenNext dev shim so `next dev` can see Cloudflare bindings locally.
if (process.env.LOCAL_DEV !== "1") {
  void import("@opennextjs/cloudflare").then(({ initOpenNextCloudflareForDev }) => {
    initOpenNextCloudflareForDev();
  });
}
