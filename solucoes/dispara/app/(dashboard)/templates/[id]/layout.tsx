import { PageLayoutScope } from '@/components/providers/PageLayoutProvider'

export default function TemplateProjectDetailsLayout({ children }: { children: React.ReactNode }) {
  // Tela “app mode”: altura cheia + overflow hidden (scroll interno), mas com padding padrão.
  return (
    <PageLayoutScope
      value={{
        width: 'wide',
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
