# Remote Claude - Local Web Dashboard (PWA)

## The Problem

I want to task Claude Code instances from my phone while I'm away from my machine. I need to:
- Submit tasks to Claude Code remotely
- Check the status and results of running/completed tasks
- Review the code changes Claude made

## The Solution

A **self-hosted PWA web dashboard** that runs on my local machine, exposed securely (e.g., via Tailscale), accessible from my phone's browser.

### Core Concept

- A lightweight web app running locally that wraps `claude -p` (Claude Code CLI in non-interactive mode)
- Submit tasks from a phone-friendly UI
- Tasks run in the background on my machine with full local environment access
- Results, diffs, and status are pushed/displayed in the dashboard
- PWA so it feels native on the phone (installable, offline shell, push notifications)

### Key Features (Planned)

1. **Task submission** - Text input to describe what Claude should do, with optional working directory selection
2. **Task queue/history** - See pending, running, and completed tasks
3. **Live output streaming** - Watch Claude's output in real-time as it works
4. **Code diff viewer** - Review what changed (git diffs) after a task completes
5. **PWA support** - Installable on phone, works like a native app, push notifications when tasks complete

### Technical Direction

- **Backend**: Lightweight server (Python/FastAPI or Node) that spawns `claude -p` processes
- **Frontend**: Modern PWA (likely vanilla or lightweight framework) with responsive/mobile-first design
- **Networking**: Intended to be exposed via Tailscale (no public internet exposure)
- **Auth**: Simple token/password since it's on a private network

### Design Status

Still in brainstorming/design phase. No code yet. Need to decide on:
- Tech stack (backend + frontend framework)
- How to handle streaming output from Claude CLI
- Task persistence (SQLite? flat files?)
- Notification mechanism (Service Workers + push? polling?)
- Security model beyond Tailscale

## Getting Started

TBD - project is in design phase.
