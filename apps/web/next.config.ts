import { createRequire } from 'node:module';
import path from 'node:path';

import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const require = createRequire(import.meta.url);
const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

// @hookform/resolvers@5 imports `zod/v4/core` from its zod adapter but only
// declares react-hook-form (not zod) as a peer dependency. Under pnpm's strict
// isolation, zod is never linked into the resolver's node_modules, so Turbopack
// cannot resolve `zod/v4/core`. We alias it to the zod actually installed for
// this app. Turbopack expects the alias value to be a project-root-relative
// path (starting with `./`), so we relativise the resolved location.
const zodV4Core =
  './' + path.relative(import.meta.dirname, require.resolve('zod/v4/core'));

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The web app talks to the API only through its own server-side BFF proxy
  // (src/app/api/[...path]/route.ts), so no public API URL is exposed.
  turbopack: {
    resolveAlias: {
      'zod/v4/core': zodV4Core,
    },
  },
};

export default withNextIntl(nextConfig);
