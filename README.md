# Remote Claude

A self-hosted PWA for managing interactive Claude Code terminal sessions remotely.
Access Claude instances from your phone via Tailscale.

## Requirements

- [Bun](https://bun.sh) runtime
- `claude` CLI in your PATH

## Setup

1. **Install dependencies**
   ```bash
   bun install
   ```

2. **Configure environment**
   ```bash
   cp .env.example .env.local
   # Edit .env.local — set AUTH_TOKEN to a strong secret
   ```

3. **Run database migrations**
   ```bash
   bun run db:migrate
   ```

4. **Start development server**
   ```bash
   bun dev
   ```

5. Open http://localhost:3000, enter your `AUTH_TOKEN` to log in.

## Production

```bash
bun run build
bun run start
```

Expose via [Tailscale](https://tailscale.com) for secure remote access from your phone.
Install as a PWA from your phone's browser for a native app experience.

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `AUTH_TOKEN` | yes | — | Your login token |
| `DATABASE_URL` | no | `./data/db.sqlite` | SQLite file path |
| `BROWSE_ROOT` | no | `/` | Restrict directory picker to this root |
