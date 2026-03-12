'use client'

import { useState, useEffect } from 'react'
import { orpcClient } from '@/lib/orpc/client'

interface CreateDialogProps {
  initialHome: string
  onClose: () => void
  onCreated: () => void
}

export function CreateSessionDialog({ initialHome, onClose, onCreated }: CreateDialogProps) {
  const [name, setName] = useState('')
  const [currentPath, setCurrentPath] = useState(initialHome)
  const [dirs, setDirs] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function browse(path: string) {
    try {
      const result = await orpcClient.directories.browse({ path })
      setDirs(result.dirs)
      setCurrentPath(result.path)
      setError('')
    } catch (err: any) {
      setError(err.message ?? 'Cannot browse path')
    }
  }

  useEffect(() => { browse(initialHome) }, [initialHome])

  async function handleCreate() {
    if (!name.trim()) { setError('Name is required'); return }
    setLoading(true)
    setError('')
    try {
      await orpcClient.sessions.create({ name: name.trim(), cwd: currentPath })
      onCreated()
    } catch (err: any) {
      setError(err.message ?? 'Failed to create session')
      setLoading(false)
    }
  }

  const parts = currentPath.split('/').filter(Boolean)
  const breadcrumbs = [
    { label: '/', path: '/' },
    ...parts.map((part, i) => ({
      label: part,
      path: '/' + parts.slice(0, i + 1).join('/'),
    })),
  ]

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50">
      <div className="bg-zinc-900 border border-zinc-700 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <h2 className="font-semibold text-zinc-50">New Session</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-200 text-xl leading-none">×</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div>
            <label className="block text-sm text-zinc-400 mb-1">Session name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. my-project"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-50 text-sm focus:outline-none focus:border-emerald-500"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm text-zinc-400 mb-1">Working directory</label>
            <div className="flex flex-wrap gap-1 mb-2 text-xs">
              {breadcrumbs.map((crumb, i) => (
                <button key={crumb.path} onClick={() => browse(crumb.path)} className="text-emerald-400 hover:text-emerald-300">
                  {crumb.label}{i < breadcrumbs.length - 1 ? ' /' : ''}
                </button>
              ))}
            </div>
            <div className="bg-zinc-800 rounded-lg border border-zinc-700 max-h-48 overflow-y-auto">
              {dirs.length === 0 && <p className="text-zinc-500 text-sm p-3">No subdirectories</p>}
              {dirs.map(dir => (
                <button
                  key={dir}
                  onClick={() => browse(`${currentPath}/${dir}`)}
                  className="w-full text-left text-sm px-3 py-2 hover:bg-zinc-700 text-zinc-300 transition-colors"
                >
                  📁 {dir}
                </button>
              ))}
            </div>
            <p className="text-xs text-zinc-500 mt-1 font-mono truncate">{currentPath}</p>
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
        </div>
        <div className="p-4 border-t border-zinc-800">
          <button
            onClick={handleCreate}
            disabled={loading || !name.trim()}
            className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-medium py-3 rounded-lg transition-colors"
          >
            {loading ? 'Creating…' : 'Create Session'}
          </button>
        </div>
      </div>
    </div>
  )
}
