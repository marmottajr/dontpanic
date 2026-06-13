import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The web app talks to the API only through its own server-side BFF proxy
  // (see src/app/api/[...path]/route.ts), so no public API URL is exposed.
};

export default nextConfig;
