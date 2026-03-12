'use client'

import { useState, useEffect, useCallback } from 'react'
import { orpcClient } from '@/lib/orpc/client'
import type { Session } from '@/lib/db/schema'
import { SessionCard } from './session-card'
import { CreateSessionDialog } from './directory-picker'

export function SessionDashboard({ initialHome }: { initialHome: string }) {
  const [sessions, setSessions] = useState<Session[]>([])
  const [showCreate, setShowCreate] = useState(false)

  const fetchSessions = useCallback(async () => {
    try {
      const data = await orpcClient.sessions.list({})
      setSessions(data)
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
      {sessions.length === 0 ? (
        <p className="text-zinc-500 text-center py-12">No sessions yet. Create one to get started.</p>
      ) : (
        <div className="space-y-3">
          {sessions.map(s => <SessionCard key={s.id} session={s} />)}
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
