'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { orpcClient } from '@/lib/orpc/client'
import type { ClaudeSession } from '@/lib/orpc/claude-sessions-logic'
import type { Session } from '@/lib/db/schema'
import { CreateSessionDialog } from './directory-picker'

// Anthropic brand: warm terracotta/coral (#D97757) as primary accent
const CONTEXT_WINDOW: Record<string, number> = {
  'claude-opus-4-6': 200_000,
  'claude-sonnet-4-6': 200_000,
  'claude-haiku-4-5-20251001': 200_000,
}
const DEFAULT_CONTEXT = 200_000

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`
  return String(n)
}

function modelShortName(model: string): string {
  if (model.includes('opus')) return 'Opus'
  if (model.includes('sonnet')) return 'Sonnet'
  if (model.includes('haiku')) return 'Haiku'
  return model
}

function timeAgo(ms: number): string {
  const diff = Date.now() - ms
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

function ContextBar({ used, total }: { used: number; total: number }) {
  const pct = Math.min(100, (used / total) * 100)
  const remaining = total - used
  const color = pct > 80 ? 'bg-red-400' : pct > 50 ? 'bg-amber-400' : 'bg-[#D97757]'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-zinc-500 whitespace-nowrap">{formatTokens(remaining)} left</span>
    </div>
  )
}

function LoadingSpinner() {
  return (
    <div className="flex flex-col items-center py-16 gap-3">
      <div className="w-8 h-8 border-2 border-zinc-700 border-t-[#D97757] rounded-full animate-spin" />
      <p className="text-sm text-zinc-500">Loading sessions…</p>
    </div>
  )
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

  const contextTotal = session.model ? (CONTEXT_WINDOW[session.model] ?? DEFAULT_CONTEXT) : DEFAULT_CONTEXT

  return (
    <div onClick={handleOpen} className="bg-[#1a1a1e] border border-zinc-800 hover:border-[#D97757]/40 rounded-xl p-4 transition-colors cursor-pointer group">
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="min-w-0 flex-1">
          {session.summary ? (
            <p className="text-sm text-zinc-100 truncate group-hover:text-[#D97757] transition-colors">{session.summary}</p>
          ) : (
            <p className="text-sm text-zinc-500 italic truncate">No prompt</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {activeSession && (
            <span className="w-2 h-2 bg-[#D97757] rounded-full animate-pulse" />
          )}
          <button
            onClick={handleOpen}
            disabled={opening}
            className="text-xs px-2.5 py-1 rounded-full border bg-[#D97757]/10 text-[#D97757] border-[#D97757]/30 hover:bg-[#D97757]/20 disabled:opacity-50 transition-colors"
          >
            {opening ? '…' : activeSession ? 'Resume' : 'Open'}
          </button>
        </div>
      </div>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs text-zinc-500 truncate font-mono">{session.cwd}</span>
        {session.gitBranch && session.gitBranch !== 'HEAD' && (
          <span className="text-[10px] text-zinc-600 font-mono shrink-0">{session.gitBranch}</span>
        )}
      </div>
      <div className="flex items-center gap-3">
        {session.model && (
          <span className="text-[10px] px-1.5 py-0.5 rounded border border-[#D97757]/20 text-[#D97757]/70 shrink-0">
            {modelShortName(session.model)}
          </span>
        )}
        {session.totalTokens != null && (
          <div className="flex-1 min-w-0">
            <ContextBar used={session.totalTokens} total={contextTotal} />
          </div>
        )}
        <span className="text-[10px] text-zinc-600 shrink-0">{timeAgo(session.updatedAt)}</span>
      </div>
    </div>
  )
}

export function SessionDashboard({ initialHome }: { initialHome: string }) {
  const router = useRouter()
  const [claudeSessions, setClaudeSessions] = useState<ClaudeSession[]>([])
  const [activeSessions, setActiveSessions] = useState<Session[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [loading, setLoading] = useState(true)

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
    } finally {
      setLoading(false)
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

  const activeByClaudeId = new Map(
    activeSessions
      .filter(s => s.claudeSessionId)
      .map(s => [s.claudeSessionId!, s])
  )

  return (
    <div className="max-w-2xl mx-auto p-4 pt-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2.5">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M16.98 6.75L13.5 4.09c-.49-.37-1.07-.59-1.68-.59h-.07c-.61 0-1.19.22-1.68.59L6.59 6.75c-.49.37-.84.88-1.02 1.45L4.04 13.5c-.18.57-.18 1.18 0 1.75l1.53 5.3c.18.57.53 1.08 1.02 1.45l3.48 2.66c.49.37 1.07.59 1.68.59h.07c.61 0 1.19-.22 1.68-.59l3.48-2.66c.49-.37.84-.88 1.02-1.45l1.53-5.3c.18-.57.18-1.18 0-1.75L18 8.2c-.18-.57-.53-1.08-1.02-1.45z" fill="#D97757"/>
          </svg>
          <h1 className="text-xl font-bold text-[#D97757]">Claude Sessions</h1>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="bg-[#D97757] hover:bg-[#c4684b] text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          + New Session
        </button>
      </div>
      {loading ? (
        <LoadingSpinner />
      ) : claudeSessions.length === 0 ? (
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
          onCreated={(id) => router.push(`/sessions/${id}`)}
        />
      )}
    </div>
  )
}
