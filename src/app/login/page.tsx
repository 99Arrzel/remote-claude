'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [token, setToken] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      if (res.ok) {
        router.push('/')
        router.refresh()
      } else {
        setError('Invalid token')
      }
    } catch {
      setError('Connection error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-emerald-400 mb-8 text-center">Remote Claude</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-zinc-400 mb-1">Access Token</label>
            <input
              type="password"
              value={token}
              onChange={e => setToken(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-zinc-50 focus:outline-none focus:border-emerald-500"
              placeholder="Enter your token"
              required
              autoFocus
            />
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-medium py-3 rounded-lg transition-colors"
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}
