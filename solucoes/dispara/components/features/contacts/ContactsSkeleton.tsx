import { Page, PageDescription, PageHeader, PageTitle, PageActions } from '@/components/ui/page'

export function ContactsSkeleton() {
  return (
    <Page className="flex flex-col h-full min-h-0">
      <PageHeader>
        <div>
          <PageTitle>Contatos</PageTitle>
          <PageDescription>Gerencie sua audiência e listas</PageDescription>
        </div>
        <PageActions className="flex-wrap justify-start sm:justify-end">
          <div className="flex items-center gap-2">
            <div className="h-10 w-10 bg-[var(--ds-bg-surface)] rounded-lg animate-pulse" />
            <div className="h-10 w-40 bg-[var(--ds-bg-surface)] rounded-lg animate-pulse" />
          </div>
          <div className="h-10 w-32 bg-primary-600/30 rounded-lg animate-pulse" />
        </PageActions>
      </PageHeader>

      {/* Hero Stats Row Skeleton */}
      <section className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="col-span-1 md:col-span-2 ds-gradient-hero p-8 rounded-2xl">
          <div className="w-32 h-4 bg-white/10 rounded animate-pulse mb-3" />
          <div className="w-40 h-10 bg-white/10 rounded animate-pulse mb-4" />
          <div className="w-36 h-5 bg-white/10 rounded animate-pulse" />
        </div>
        {[...Array(2)].map((_, i) => (
          <div key={i} className="ds-stat-card p-6">
            <div className="w-10 h-10 rounded-lg bg-[var(--ds-bg-surface)] animate-pulse mb-4" />
            <div className="w-24 h-3 bg-[var(--ds-bg-surface)] rounded animate-pulse mb-2" />
            <div className="w-16 h-7 bg-[var(--ds-bg-surface)] rounded animate-pulse" />
          </div>
        ))}
      </section>

      {/* Table Skeleton */}
      <div className="ds-table-wrapper flex-1 min-h-0 flex flex-col">
        <div className="p-4 border-b border-[var(--ds-border-subtle)] flex gap-3">
          <div className="flex-1 h-10 bg-[var(--ds-bg-surface)]/50 rounded-full animate-pulse" />
          <div className="h-10 w-32 bg-[var(--ds-bg-surface)]/50 rounded-lg animate-pulse" />
        </div>
        <div className="flex-1 p-4 space-y-2">
          <div className="h-10 bg-[var(--ds-bg-surface)]/30 rounded animate-pulse" />
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-14 bg-[var(--ds-bg-surface)]/15 rounded animate-pulse" />
          ))}
        </div>
        <div className="p-4 border-t border-[var(--ds-border-subtle)] flex justify-center gap-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-8 w-8 bg-[var(--ds-bg-surface)]/50 rounded animate-pulse" />
          ))}
        </div>
      </div>
    </Page>
  )
}
