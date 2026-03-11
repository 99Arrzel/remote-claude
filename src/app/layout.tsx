import './globals.css'
import type { ReactNode } from 'react'
import { getDb } from '@/lib/db'
import { reconcileActiveSessions } from '@/lib/startup'

let reconciled = false
async function ensureReconciled() {
  if (reconciled) return
  reconciled = true
  await reconcileActiveSessions(getDb())
}

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

export default async function RootLayout({ children }: { children: ReactNode }) {
  await ensureReconciled()
  return (
    <html lang="en">
      <body className="bg-zinc-950 text-zinc-50 min-h-screen">{children}</body>
    </html>
  )
}
