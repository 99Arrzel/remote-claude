import './globals.css'
import type { ReactNode } from 'react'

export const metadata = {
  title: 'Remote Claude',
  description: 'Claude terminal sessions from anywhere',
  manifest: '/manifest.json',
}

export const viewport = {
  themeColor: '#10b981',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-zinc-950 text-zinc-50 min-h-screen">{children}</body>
    </html>
  )
}
