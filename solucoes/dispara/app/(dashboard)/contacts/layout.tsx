import { PageLayoutScope } from '@/components/providers/PageLayoutProvider'

export default function ContactsLayout({ children }: { children: React.ReactNode }) {
  // Padrão do dashboard (max-w + padding) + altura cheia e scroll interno.
  return (
    <PageLayoutScope
      value={{
        width: 'content',
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
