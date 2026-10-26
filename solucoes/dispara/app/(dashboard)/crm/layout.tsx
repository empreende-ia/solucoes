import { PageLayoutScope } from '@/components/providers/PageLayoutProvider'

export default function CrmLayout({ children }: { children: React.ReactNode }) {
  // Largura total + altura cheia: o kanban rola horizontalmente dentro da página.
  return (
    <PageLayoutScope
      value={{
        width: 'full',
        padded: true,
        overflow: 'hidden',
        height: 'full',
        showAccountAlerts: true,
      }}
    >
      {children}
    </PageLayoutScope>
  )
}
