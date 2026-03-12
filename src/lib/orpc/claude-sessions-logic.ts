import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'

export interface ClaudeSession {
  id: string
  cwd: string
  summary: string | null
  gitBranch: string | null
  model: string | null
  totalTokens: number | null
  updatedAt: number
}

export async function listClaudeSessions(projectsDir?: string): Promise<ClaudeSession[]> {
  const dir = projectsDir ?? join(homedir(), '.claude', 'projects')
  return listClaudeSessionsFromDir(dir)
}

async function listClaudeSessionsFromDir(projectsDir: string): Promise<ClaudeSession[]> {
  const sessions: ClaudeSession[] = []

  let projectDirs: string[]
  try {
    projectDirs = await readdir(projectsDir)
  } catch {
    return []
  }

  await Promise.all(projectDirs.map(async (projDir) => {
    const projPath = join(projectsDir, projDir)
    let files: string[]
    try {
      const entries = await readdir(projPath)
      files = entries.filter(f => f.endsWith('.jsonl'))
    } catch {
      return
    }

    await Promise.all(files.map(async (file) => {
      const sessionId = file.replace('.jsonl', '')
      const filePath = join(projPath, file)

      let mtime: number
      try {
        const s = await stat(filePath)
        mtime = s.mtimeMs
      } catch {
        return
      }

      let cwd: string | null = null
      let summary: string | null = null
      let gitBranch: string | null = null
      let model: string | null = null
      let totalTokens: number | null = null

      try {
        const content = await readFile(filePath, 'utf-8')
        for (const line of content.split('\n')) {
          if (!line.trim()) continue
          try {
            const d = JSON.parse(line)
            if (!cwd && d.cwd) {
              cwd = d.cwd
              gitBranch = d.gitBranch ?? null
            }
            if (!summary && d.type === 'user' && !d.isMeta) {
              const msgContent = d.message?.content ?? ''
              if (typeof msgContent === 'string' && msgContent.trim() && !msgContent.startsWith('<')) {
                summary = msgContent.trim().slice(0, 120)
              } else if (Array.isArray(msgContent)) {
                for (const block of msgContent) {
                  if (block?.type === 'text' && block.text?.trim() && !block.text.startsWith('<')) {
                    summary = block.text.trim().slice(0, 120)
                    break
                  }
                }
              }
            }
            // Track latest assistant message for model + usage
            if (d.type === 'assistant') {
              const msg = d.message
              if (msg?.model) model = msg.model
              if (msg?.usage) {
                const u = msg.usage
                totalTokens =
                  (u.input_tokens ?? 0) +
                  (u.cache_creation_input_tokens ?? 0) +
                  (u.cache_read_input_tokens ?? 0) +
                  (u.output_tokens ?? 0)
              }
            }
          } catch {
            // skip malformed lines
          }
        }
      } catch {
        return
      }

      if (!cwd) return
      sessions.push({ id: sessionId, cwd, summary, gitBranch, model, totalTokens, updatedAt: mtime })
    }))
  }))

  return sessions.sort((a, b) => b.updatedAt - a.updatedAt)
}
