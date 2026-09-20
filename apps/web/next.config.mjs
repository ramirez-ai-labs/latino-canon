/** @type {import("next").NextConfig} */
const nextConfig = {
  images: {
    // Posters are served from our R2 bucket via the api worker.
    remotePatterns: [{ protocol: "https", hostname: "*.workers.dev" }],
    // OpenNext's Cloudflare adapter doesn't run Next's /_next/image resize proxy
    // (that's Vercel-specific infra) - unoptimized still gets next/image's
    // lazy-loading and layout-shift prevention without a broken optimizer endpoint.
    unoptimized: true,
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
