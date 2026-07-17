/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep production builds stable on hosts that expose a very high CPU count.
  experimental: {
    cpus: 2,
    staticGenerationMaxConcurrency: 2,
  },
};

export default nextConfig;
