import { useNavigate } from 'react-router-dom';
import { Search, Plus, Users, Kanban, ClipboardList, Sparkles, Settings2 } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ds/dropdown-menu';
import { TourLauncher } from '@/components/tours';
import { useCrmPermissions } from '@/hooks/useCrmPermissions';
import { useOnboardingGuide } from '@/components/onboarding/CrmOnboardingContext';
import { useShell } from './ShellContext';

const quickActions = [
  { label: 'Novo contato', icon: Users, path: '/contacts?action=new' },
  { label: 'Nova oportunidade', icon: Kanban, path: '/pipeline?create=1' },
  { label: 'Nova tarefa', icon: ClipboardList, path: '/tasks?action=new' },
];
const actionClass = 'flex h-9 min-w-9 shrink-0 items-center justify-center gap-2 rounded-full border border-border bg-transparent px-2 text-sm text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export function TopbarActions() {
  const navigate = useNavigate();
  const { openSearch } = useShell();
  const permissions = useCrmPermissions();
  const setup = useOnboardingGuide();
  return <div className="eia-global-actions flex w-full min-w-0 max-w-full items-center justify-between gap-1.5 md:w-auto md:justify-end">
    <TourLauncher className="product-tour-launcher--shell" />
    <button type="button" onClick={openSearch} aria-label="Buscar no CRM (Ctrl ou ⌘ K)" title="Buscar no CRM (Ctrl ou ⌘ K)" className={actionClass}>
      <Search className="h-4 w-4" aria-hidden="true" /><span className="hidden xl:inline">Buscar</span>
    </button>
    <DropdownMenu>
      <DropdownMenuTrigger asChild><button data-tour="shell-quick-actions" type="button" aria-label="Ações rápidas" title="Ações rápidas" className={actionClass}><Plus className="h-4 w-4" aria-hidden="true" /></button></DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-w-[calc(100vw-24px)] min-w-52">
        {permissions.canWrite ? quickActions.map((action) => <DropdownMenuItem key={action.path} onSelect={() => navigate(action.path)}><action.icon className="mr-2 h-4 w-4" aria-hidden="true" />{action.label}</DropdownMenuItem>)
          : <p className="px-2 py-2 text-xs leading-relaxed text-muted-foreground">{permissions.loading ? 'Verificando seu acesso…' : permissions.error ? 'Não foi possível verificar seu acesso. Tente novamente na página desejada.' : 'Seu papel permite consultar registros. Solicite acesso de edição ao administrador.'}</p>}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => setup?.openGuide()}><Settings2 className="mr-2 h-4 w-4" aria-hidden="true" />Configurar CRM</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    <button type="button" aria-label="Abrir Copiloto" title="Abrir Copiloto" className={actionClass} onClick={() => window.dispatchEvent(new Event('empreende-crm:open-copilot'))}><Sparkles className="h-4 w-4" aria-hidden="true" /></button>
  </div>;
}

export default TopbarActions;
