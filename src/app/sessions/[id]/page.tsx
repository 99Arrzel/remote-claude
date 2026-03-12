import { TerminalView } from '@/components/terminal'

interface Props {
  params: Promise<{ id: string }>
}

export default async function SessionPage({ params }: Props) {
  const { id } = await params
  return <TerminalView sessionId={id} />
}
