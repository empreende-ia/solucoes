import { Page, PageActions, PageDescription, PageHeader, PageTitle } from '@/components/ui/page'

export function DashboardSkeleton() {
  return (
    <Page>
      <PageHeader>
        <div>
          <PageTitle>Dashboard</PageTitle>
          <PageDescription>Visão geral da performance de mensagens</PageDescription>
        </div>
        <PageActions>
          <div className="h-10 w-36 bg-[var(--ds-bg-surface)] rounded-lg animate-pulse" />
        </PageActions>
      </PageHeader>

      {/* Hero Stats Row Skeleton */}
      <section className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="col-span-1 md:col-span-2 ds-gradient-hero p-8 rounded-2xl">
          <div className="w-32 h-4 bg-white/10 rounded animate-pulse mb-3" />
          <div className="w-48 h-10 bg-white/10 rounded animate-pulse mb-4" />
          <div className="w-36 h-5 bg-white/10 rounded animate-pulse" />
        </div>
        {[...Array(2)].map((_, i) => (
          <div key={i} className="ds-stat-card p-6">
            <div className="w-10 h-10 rounded-lg bg-[var(--ds-bg-surface)] animate-pulse mb-4" />
            <div className="w-24 h-3 bg-[var(--ds-bg-surface)] rounded animate-pulse mb-2" />
            <div className="w-16 h-7 bg-[var(--ds-bg-surface)] rounded animate-pulse" />
            <div className="h-1 bg-[var(--ds-bg-surface)] rounded-full mt-4" />
          </div>
        ))}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Chart Skeleton */}
        <div className="lg:col-span-2 ds-stat-card p-8">
          <div className="flex items-center justify-between mb-8">
            <div className="h-6 w-40 bg-[var(--ds-bg-surface)] rounded animate-pulse" />
            <div className="flex gap-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-7 w-12 bg-[var(--ds-bg-surface)] rounded-full animate-pulse" />
              ))}
            </div>
          </div>
          <div className="h-72 w-full bg-[var(--ds-bg-surface)]/30 rounded-xl animate-pulse" />
        </div>

        {/* Recent Campaigns Skeleton */}
        <div className="ds-table-wrapper flex flex-col">
          <div className="p-6 border-b border-[var(--ds-border-default)] flex justify-between items-center">
            <div className="h-6 w-44 bg-[var(--ds-bg-surface)] rounded animate-pulse" />
            <div className="h-5 w-5 bg-[var(--ds-bg-surface)] rounded animate-pulse" />
          </div>
          <div className="flex-1">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="px-6 py-5 border-b border-[var(--ds-border-subtle)] flex justify-between items-center">
                <div className="space-y-2">
                  <div className="h-4 w-32 bg-[var(--ds-bg-surface)] rounded animate-pulse" />
                  <div className="h-3 w-20 bg-[var(--ds-bg-surface)]/60 rounded animate-pulse" />
                </div>
                <div className="h-6 w-20 bg-[var(--ds-bg-surface)] rounded-full animate-pulse" />
              </div>
            ))}
          </div>
          <div className="p-4 border-t border-[var(--ds-border-default)] bg-[var(--ds-bg-surface)]/20">
            <div className="h-4 w-32 bg-[var(--ds-bg-surface)] rounded animate-pulse mx-auto" />
          </div>
        </div>
      </div>
    </Page>
  )
}
