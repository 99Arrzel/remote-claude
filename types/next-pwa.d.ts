declare module 'next-pwa' {
  import type { NextConfig } from 'next'

  interface RuntimeCachingEntry {
    urlPattern: string | RegExp
    handler: string
    options?: Record<string, unknown>
  }

  interface PWAConfig {
    dest?: string
    register?: boolean
    skipWaiting?: boolean
    disable?: boolean
    runtimeCaching?: RuntimeCachingEntry[]
    buildExcludes?: Array<string | RegExp>
    publicExcludes?: string[]
    [key: string]: unknown
  }

  function withPWA(config: PWAConfig): (nextConfig: NextConfig) => NextConfig
  export = withPWA
}
