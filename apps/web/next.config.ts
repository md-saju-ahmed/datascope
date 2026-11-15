import type { NextConfig } from 'next';
import { fileURLToPath } from 'node:url';

const config: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: fileURLToPath(new URL('../../', import.meta.url)),
  poweredByHeader: false,
  headers() {
    return Promise.resolve([
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'same-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ]);
  },
};
export default config;
