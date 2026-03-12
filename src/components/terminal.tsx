'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { orpcClient } from '@/lib/orpc/client'

export function TerminalView({ sessionId }: { sessionId: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<string>('loading')
  const [sessionName, setSessionName] = useState('')
  const [cwd, setCwd] = useState('')
  const [ended, setEnded] = useState(false)
  const router = useRouter()

  const killSession = useCallback(async () => {
    if (!confirm('Kill this session?')) return
    await orpcClient.sessions.delete({ id: sessionId })
    router.push('/')
  }, [sessionId, router])

  useEffect(() => {
    if (!containerRef.current) return
    let destroyed = false

    async function init() {
      const [{ Terminal }, { FitAddon }] = await Promise.all([
        import('@xterm/xterm'),
        import('@xterm/addon-fit'),
      ])
      await import('@xterm/xterm/css/xterm.css')
      if (destroyed) return

      const session = await orpcClient.sessions.get({ id: sessionId })
      if (destroyed) return
      setSessionName(session.name)
      setCwd(session.cwd)
      setStatus(session.status)

      const term = new Terminal({
        theme: { background: '#09090b', foreground: '#f4f4f5', cursor: '#10b981' },
        fontSize: 14,
        fontFamily: 'monospace',
        cursorBlink: true,
      })
      const fitAddon = new FitAddon()
      term.loadAddon(fitAddon)
      term.open(containerRef.current!)
      fitAddon.fit()

      if (session.status === 'active') {
        await orpcClient.sessions.resize({ id: sessionId, cols: term.cols, rows: term.rows })
        term.onKey(({ key }) => {
          orpcClient.sessions.input({ id: sessionId, data: key }).catch(() => {})
        })
      }

      const resizeObserver = new ResizeObserver(() => {
        fitAddon.fit()
        if (!destroyed && session.status === 'active') {
          orpcClient.sessions.resize({ id: sessionId, cols: term.cols, rows: term.rows }).catch(() => {})
        }
      })
      resizeObserver.observe(containerRef.current!)

      // Stream terminal output (works for active, exited, and killed sessions)
      // orpcClient.sessions.stream returns Promise<AsyncGenerator> because the server
      // handler is an async generator — await gets the iterable, then for-await consumes it
      for await (const event of await orpcClient.sessions.stream({ id: sessionId })) {
        if (destroyed) break
        if (event.type === 'output') {
          term.write(event.data)
        } else if (event.type === 'exit') {
          setEnded(true)
          setStatus('exited')
        }
      }

      resizeObserver.disconnect()
      term.dispose()
    }

    init().catch(console.error)
    return () => { destroyed = true }
  }, [sessionId])

  return (
    <div className="flex flex-col h-screen bg-zinc-950">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800 shrink-0">
        <button onClick={() => router.push('/')} className="text-zinc-400 hover:text-zinc-200 text-lg leading-none">←</button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-zinc-50 truncate">{sessionName || sessionId}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full border ${
              status === 'active' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' :
              status === 'killed' ? 'bg-red-500/20 text-red-400 border-red-500/30' :
              'bg-zinc-700/40 text-zinc-400 border-zinc-600/30'
            }`}>{status}</span>
          </div>
          <p className="text-xs text-zinc-500 font-mono truncate">{cwd}</p>
        </div>
        {status === 'active' && (
          <button onClick={killSession} className="text-sm text-red-400 hover:text-red-300 shrink-0">Kill</button>
        )}
      </div>
      <div className="flex-1 overflow-hidden relative">
        <div ref={containerRef} className="w-full h-full" />
        {ended && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-zinc-800 border border-zinc-700 text-zinc-300 text-sm px-4 py-2 rounded-full">
            Session ended
          </div>
        )}
      </div>
    </div>
  )
}
