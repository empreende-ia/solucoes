import { PageLayoutScope } from '@/components/providers/PageLayoutProvider'

export default function NewTemplateProjectLayout({ children }: { children: React.ReactNode }) {
  // Página padrão (max-w + padding + scroll natural).
  return (
    <PageLayoutScope
      value={{
        width: 'content',
        padded: true,
        overflow: 'auto',
        height: 'auto',
        showAccountAlerts: true,
      }}
    >
      {children}
    </PageLayoutScope>
  )
}
