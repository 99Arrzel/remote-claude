#!/usr/bin/env node
// PTY bridge — runs under Node.js to work around Bun + node-pty incompatibility.
// Bun sends SIGHUP to node-pty children and never fires onData callbacks.
//
// Protocol:
//   stdin  → raw PTY input, except lines starting with \x00 are JSON control commands
//   stdout → raw PTY output
//   exit   → PTY process exit code

import nodePty from 'node-pty'

const cmd = process.env.PTY_CMD || 'bash'
const args = process.env.PTY_ARGS ? JSON.parse(process.env.PTY_ARGS) : []
const cols = parseInt(process.env.PTY_COLS) || 220
const rows = parseInt(process.env.PTY_ROWS) || 50
const cwd = process.env.PTY_CWD || process.cwd()

// Build clean env: remove bridge-specific vars and CLAUDECODE
const env = {}
for (const [k, v] of Object.entries(process.env)) {
  if (!k.startsWith('PTY_') && k !== 'CLAUDECODE') env[k] = v
}

const ptyProcess = nodePty.spawn(cmd, args, {
  name: 'xterm-256color', cols, rows, cwd, env,
})

ptyProcess.onData((data) => {
  process.stdout.write(data)
})

ptyProcess.onExit(({ exitCode }) => {
  process.exit(exitCode ?? 0)
})

// Handle incoming data — raw input or control commands
let buf = ''
process.stdin.setEncoding('utf-8')
process.stdin.on('data', (chunk) => {
  buf += chunk
  // Process any control commands (lines starting with NUL byte)
  while (buf.includes('\n')) {
    const idx = buf.indexOf('\n')
    const line = buf.slice(0, idx)
    buf = buf.slice(idx + 1)
    if (line.startsWith('\x00')) {
      try {
        const cmd = JSON.parse(line.slice(1))
        if (cmd.type === 'resize') {
          ptyProcess.resize(cmd.cols, cmd.rows)
        }
      } catch {
        // ignore malformed control commands
      }
    } else {
      ptyProcess.write(line + '\n')
    }
  }
  // Any remaining buffer without newline is raw input
  if (buf && !buf.startsWith('\x00')) {
    ptyProcess.write(buf)
    buf = ''
  }
})

process.on('SIGTERM', () => ptyProcess.kill())
process.on('SIGINT', () => ptyProcess.kill())
