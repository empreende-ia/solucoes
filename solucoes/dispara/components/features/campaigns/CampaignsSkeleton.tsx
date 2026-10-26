import { Page, PageDescription, PageHeader, PageTitle } from '@/components/ui/page'

export function CampaignsSkeleton() {
  return (
    <Page>
      <PageHeader>
        <div>
          <PageTitle>Campanhas</PageTitle>
          <PageDescription>Gerencie seus disparos de mensagens</PageDescription>
        </div>
      </PageHeader>

      {/* Filters Skeleton */}
      <div className="ds-stat-card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="h-10 w-full sm:w-96 bg-[var(--ds-bg-surface)]/50 rounded-full animate-pulse" />
        <div className="flex items-center gap-2">
          <div className="h-10 w-10 bg-[var(--ds-bg-surface)]/50 rounded-lg animate-pulse" />
          <div className="h-10 w-32 bg-[var(--ds-bg-surface)]/50 rounded-lg animate-pulse" />
          <div className="h-10 w-32 bg-[var(--ds-bg-surface)]/50 rounded-lg animate-pulse" />
        </div>
      </div>

      {/* Table Skeleton */}
      <div className="ds-table-wrapper">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-[var(--ds-bg-surface)]/30">
                {['Nome', 'Status', 'Destinatários', 'Entrega', 'Envio', 'Criado em', 'Ações'].map((h) => (
                  <th key={h} className="px-6 py-5 text-left">
                    <div className="h-3 w-16 bg-[var(--ds-bg-surface)] rounded animate-pulse" />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--ds-border-subtle)]">
              {[...Array(6)].map((_, i) => (
                <tr key={i}>
                  <td className="px-6 py-5">
                    <div className="space-y-2">
                      <div className="h-4 w-40 bg-[var(--ds-bg-surface)]/60 rounded animate-pulse" />
                      <div className="h-3 w-24 bg-[var(--ds-bg-surface)]/40 rounded animate-pulse" />
                    </div>
                  </td>
                  <td className="px-6 py-5"><div className="h-6 w-20 bg-[var(--ds-bg-surface)]/50 rounded-full animate-pulse" /></td>
                  <td className="px-6 py-5"><div className="h-4 w-12 bg-[var(--ds-bg-surface)]/40 rounded animate-pulse" /></td>
                  <td className="px-6 py-5"><div className="h-2 w-24 bg-[var(--ds-bg-surface)]/30 rounded-full animate-pulse" /></td>
                  <td className="px-6 py-5"><div className="h-4 w-12 bg-[var(--ds-bg-surface)]/40 rounded animate-pulse" /></td>
                  <td className="px-6 py-5"><div className="h-4 w-20 bg-[var(--ds-bg-surface)]/40 rounded animate-pulse" /></td>
                  <td className="px-6 py-5"><div className="flex justify-end gap-1">{[...Array(3)].map((_, j) => <div key={j} className="h-7 w-7 bg-[var(--ds-bg-surface)]/40 rounded animate-pulse" />)}</div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Page>
  )
}
