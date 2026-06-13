import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The web app talks to the API only through its own server-side BFF proxy
  // (src/app/api/[...path]/route.ts), so no public API URL is exposed.
};

export default withNextIntl(nextConfig);
