import { Page, PageDescription, PageHeader, PageTitle, PageActions } from '@/components/ui/page'

export function FormsSkeleton() {
  return (
    <Page>
      <PageHeader>
        <div>
          <PageTitle>Formulários</PageTitle>
          <PageDescription>Capture leads com formulários públicos</PageDescription>
        </div>
        <PageActions>
          <div className="h-10 w-36 bg-primary-600/30 rounded-lg animate-pulse" />
        </PageActions>
      </PageHeader>

      <div className="ds-table-wrapper">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-[var(--ds-bg-surface)]/30">
                {['Nome', 'Status', 'URL', 'Ações'].map((h) => (
                  <th key={h} className="px-6 py-5 text-left">
                    <div className="h-3 w-16 bg-[var(--ds-bg-surface)] rounded animate-pulse" />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...Array(5)].map((_, i) => (
                <tr key={i} className="border-b border-[var(--ds-border-subtle)]">
                  <td className="px-6 py-5">
                    <div className="space-y-2">
                      <div className="h-4 w-40 bg-[var(--ds-bg-surface)]/60 rounded animate-pulse" />
                      <div className="h-3 w-24 bg-[var(--ds-bg-surface)]/40 rounded animate-pulse" />
                    </div>
                  </td>
                  <td className="px-6 py-5"><div className="h-6 w-16 bg-[var(--ds-bg-surface)]/50 rounded-full animate-pulse" /></td>
                  <td className="px-6 py-5"><div className="h-4 w-48 bg-[var(--ds-bg-surface)]/40 rounded animate-pulse" /></td>
                  <td className="px-6 py-5">
                    <div className="flex justify-end gap-2">
                      <div className="h-8 w-8 bg-[var(--ds-bg-surface)]/50 rounded animate-pulse" />
                      <div className="h-8 w-8 bg-[var(--ds-bg-surface)]/50 rounded animate-pulse" />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Page>
  )
}
