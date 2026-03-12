import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'

export interface ClaudeSession {
  id: string
  cwd: string
  summary: string | null
  gitBranch: string | null
  updatedAt: number
}

export async function listClaudeSessions(): Promise<ClaudeSession[]> {
  const projectsDir = join(homedir(), '.claude', 'projects')
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
            if (cwd && summary) break
          } catch {
            // skip malformed lines
          }
        }
      } catch {
        return
      }

      if (!cwd) return
      sessions.push({ id: sessionId, cwd, summary, gitBranch, updatedAt: mtime })
    }))
  }))

  return sessions.sort((a, b) => b.updatedAt - a.updatedAt)
}
