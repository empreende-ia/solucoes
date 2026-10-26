import { Suspense } from 'react'
import { getInboxInitialData } from './actions'
import { InboxClientWrapper } from './InboxClientWrapper'
import { InboxErrorFallback } from './InboxErrorFallback'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { PageLayoutScope } from '@/components/providers/PageLayoutProvider'
import { Loader2 } from 'lucide-react'

// ISR: revalida a cada 30 segundos (inbox precisa de dados mais frescos)
export const revalidate = 30

/** Full-bleed layout for inbox - no padding, fills available space */
const INBOX_LAYOUT = {
  padded: false,
  width: 'full' as const,
  height: 'full' as const,
  overflow: 'hidden' as const,
  showAccountAlerts: false,
}

async function InboxWithData() {
  const initialData = await getInboxInitialData()
  return <InboxClientWrapper initialData={initialData ?? undefined} />
}

function LoadingFallback() {
  return (
    <div className="h-full flex items-center justify-center bg-[var(--ds-bg-base)]">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
        <p className="text-sm text-[var(--ds-text-muted)]">Carregando inbox...</p>
      </div>
    </div>
  )
}

/**
 * Inbox Page - RSC Híbrido
 *
 * Layout especial: full-bleed (sem padding, altura total)
 */
export default function InboxPage() {
  return (
    <PageLayoutScope value={INBOX_LAYOUT}>
      <ErrorBoundary fallback={<InboxErrorFallback />}>
        <Suspense fallback={<LoadingFallback />}>
          <InboxWithData />
        </Suspense>
      </ErrorBoundary>
    </PageLayoutScope>
  )
}
