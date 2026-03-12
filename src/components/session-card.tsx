'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { orpcClient } from '@/lib/orpc/client'
import type { Session } from '@/lib/db/schema'

function timeAgo(ms: number): string {
  const diff = Date.now() - ms
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

const STATUS_STYLES: Record<Session['status'], string> = {
  active: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  exited: 'bg-zinc-700/40 text-zinc-400 border-zinc-600/30',
  killed: 'bg-red-500/20 text-red-400 border-red-500/30',
}

export function SessionCard({ session }: { session: Session }) {
  const router = useRouter()
  const [resuming, setResuming] = useState(false)

  async function handleResume(e: React.MouseEvent) {
    e.stopPropagation()
    setResuming(true)
    try {
      const newSession = await orpcClient.sessions.create({
        name: session.name,
        cwd: session.cwd,
        resume: true,
      })
      router.push(`/sessions/${newSession.id}`)
    } catch {
      setResuming(false)
    }
  }

  return (
    <div
      onClick={() => router.push(`/sessions/${session.id}`)}
      className="w-full text-left bg-zinc-900 border border-zinc-800 hover:border-zinc-600 rounded-xl p-4 transition-colors cursor-pointer"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="font-medium text-zinc-50 truncate">{session.name}</span>
        <div className="flex items-center gap-2 shrink-0">
          {session.status === 'active' && (
            <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
          )}
          <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_STYLES[session.status]}`}>
            {session.status}
          </span>
          {session.status !== 'active' && (
            <button
              onClick={handleResume}
              disabled={resuming}
              className="text-xs px-2 py-0.5 rounded-full border bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20 disabled:opacity-50 transition-colors"
            >
              {resuming ? '…' : 'Resume'}
            </button>
          )}
        </div>
      </div>
      <p className="text-xs text-zinc-500 truncate font-mono">{session.cwd}</p>
      <p className="text-xs text-zinc-600 mt-1">{timeAgo(session.updatedAt)}</p>
    </div>
  )
}
