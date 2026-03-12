import type { NextConfig } from 'next'
import withPWA from 'next-pwa'

const nextConfig: NextConfig = {
  // Native/Bun-specific modules — must stay server-side only and not be bundled
  serverExternalPackages: ['node-pty', 'bun:sqlite'],
  // Silence Turbopack warning from next-pwa's webpack config injection
  turbopack: {},
}

export default withPWA({
  dest: 'public',
  register: true,
  skipWaiting: true,
  runtimeCaching: [
    {
      urlPattern: /^\/api\//,
      handler: 'NetworkOnly', // Never cache API routes — SSE streams must not be intercepted
    },
    {
      urlPattern: /^\/_next\/static\//,
      handler: 'CacheFirst',
      options: { cacheName: 'static-assets' },
    },
    {
      urlPattern: /^\/(?!api|_next)/,
      handler: 'NetworkFirst',
      options: { cacheName: 'pages', networkTimeoutSeconds: 10 },
    },
  ],
})(nextConfig)
