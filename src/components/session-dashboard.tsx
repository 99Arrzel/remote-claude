'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { orpcClient } from '@/lib/orpc/client'
import type { ClaudeSession } from '@/lib/orpc/claude-sessions-logic'
import type { Session } from '@/lib/db/schema'
import { CreateSessionDialog } from './directory-picker'

function timeAgo(ms: number): string {
  const diff = Date.now() - ms
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

function ClaudeSessionCard({
  session,
  activeSession,
}: {
  session: ClaudeSession
  activeSession: Session | null
}) {
  const router = useRouter()
  const [opening, setOpening] = useState(false)

  async function handleOpen(e: React.MouseEvent) {
    e.stopPropagation()
    if (activeSession) {
      router.push(`/sessions/${activeSession.id}`)
      return
    }
    setOpening(true)
    try {
      const newSession = await orpcClient.sessions.create({
        name: session.summary?.slice(0, 40) ?? session.cwd.split('/').pop() ?? 'session',
        cwd: session.cwd,
        claudeSessionId: session.id,
      })
      router.push(`/sessions/${newSession.id}`)
    } catch {
      setOpening(false)
    }
  }

  const dirName = session.cwd.split('/').pop() ?? session.cwd

  return (
    <div className="bg-zinc-900 border border-zinc-800 hover:border-zinc-600 rounded-xl p-4 transition-colors">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <span className="font-medium text-zinc-50 truncate block">{dirName}</span>
          {session.gitBranch && session.gitBranch !== 'HEAD' && (
            <span className="text-xs text-zinc-500 font-mono">{session.gitBranch}</span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {activeSession && (
            <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
          )}
          <button
            onClick={handleOpen}
            disabled={opening}
            className="text-xs px-2 py-0.5 rounded-full border bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20 disabled:opacity-50 transition-colors"
          >
            {opening ? '…' : activeSession ? 'Resume' : 'Open'}
          </button>
        </div>
      </div>
      {session.summary && (
        <p className="text-xs text-zinc-400 truncate mb-1">{session.summary}</p>
      )}
      <p className="text-xs text-zinc-500 truncate font-mono">{session.cwd}</p>
      <p className="text-xs text-zinc-600 mt-1">{timeAgo(session.updatedAt)}</p>
    </div>
  )
}

export function SessionDashboard({ initialHome }: { initialHome: string }) {
  const [claudeSessions, setClaudeSessions] = useState<ClaudeSession[]>([])
  const [activeSessions, setActiveSessions] = useState<Session[]>([])
  const [showCreate, setShowCreate] = useState(false)

  const fetchSessions = useCallback(async () => {
    try {
      const [claude, active] = await Promise.all([
        orpcClient.claudeSessions.list({}),
        orpcClient.sessions.list({ status: 'active' }),
      ])
      setClaudeSessions(claude)
      setActiveSessions(active)
    } catch (err) {
      console.error('Failed to fetch sessions', err)
    }
  }, [])

  useEffect(() => {
    fetchSessions()
    const interval = setInterval(fetchSessions, 5000)
    window.addEventListener('focus', fetchSessions)
    return () => {
      clearInterval(interval)
      window.removeEventListener('focus', fetchSessions)
    }
  }, [fetchSessions])

  // Map claudeSessionId → active PTY session
  const activeByClaudeId = new Map(
    activeSessions
      .filter(s => s.claudeSessionId)
      .map(s => [s.claudeSessionId!, s])
  )

  return (
    <div className="max-w-2xl mx-auto p-4 pt-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-emerald-400">Remote Claude</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          + New Session
        </button>
      </div>
      {claudeSessions.length === 0 ? (
        <p className="text-zinc-500 text-center py-12">No Claude sessions found.</p>
      ) : (
        <div className="space-y-3">
          {claudeSessions.map(s => (
            <ClaudeSessionCard
              key={s.id}
              session={s}
              activeSession={activeByClaudeId.get(s.id) ?? null}
            />
          ))}
        </div>
      )}
      {showCreate && (
        <CreateSessionDialog
          initialHome={initialHome}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); fetchSessions() }}
        />
      )}
    </div>
  )
}
