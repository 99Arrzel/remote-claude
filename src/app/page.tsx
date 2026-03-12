import { SessionDashboard } from '@/components/session-dashboard'

export default function HomePage() {
  const home = process.env.HOME ?? '/'
  return <SessionDashboard initialHome={home} />
}
