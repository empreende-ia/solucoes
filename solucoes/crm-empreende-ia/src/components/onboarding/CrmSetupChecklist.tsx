import { ArrowRight, CheckCircle2, Circle, CircleAlert, Loader2, Settings2 } from 'lucide-react';
import { Button } from '@/components/ds/button';
import { useOnboardingGuide } from './CrmOnboardingContext';
import { SETUP_STEPS, type SetupStepId } from './setup-state';

export function CrmSetupChecklist({ onOpenGuide }: { onOpenGuide?: (stepId?: SetupStepId) => void }) {
  const setup = useOnboardingGuide();
  if (!setup) return null;
  const open = onOpenGuide ?? setup.openGuide;
  return <section aria-labelledby="crm-setup-checklist-title" className="rounded-2xl border border-border bg-card p-4 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 id="crm-setup-checklist-title" className="text-base font-semibold">Configuração do CRM</h2><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Você pode usar o CRM e preparar estas etapas no seu ritmo.</p></div>
      <Button size="sm" variant="outline" onClick={() => open()}><Settings2 aria-hidden="true" className="mr-1.5 h-4 w-4" />Configurar CRM</Button>
    </div>
    {setup.loading ? <p role="status" className="mt-4 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />Verificando registros…</p> : <>
      <p role="status" className="mt-4 text-xs text-muted-foreground">{setup.completed} de {SETUP_STEPS.length} etapas verificadas{setup.refreshing ? ' · Atualizando…' : ''}</p>
      <ol className="mt-3 space-y-1">
        {SETUP_STEPS.map((step) => {
          const status = setup.evidence[step.id];
          const Icon = status === 'done' ? CheckCircle2 : status === 'error' ? CircleAlert : Circle;
          return <li key={step.id}><button type="button" onClick={() => open(step.id)} className="flex min-h-11 w-full items-center gap-3 rounded-xl px-2 py-2 text-left text-sm hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Icon aria-hidden="true" className={`h-4 w-4 shrink-0 ${status === 'done' ? 'text-primary' : status === 'error' ? 'text-destructive' : 'text-muted-foreground'}`} />
            <span className="min-w-0 flex-1"><span className="block">{step.title}</span><span className="text-xs text-muted-foreground">{status === 'done' ? 'Verificado nos registros' : status === 'error' ? 'Não foi possível verificar' : 'A preparar'}</span></span><ArrowRight aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </button></li>;
        })}
      </ol>
    </>}
    {setup.hasError && <p role="alert" className="mt-3 text-xs leading-relaxed text-destructive">Algumas etapas não puderam ser consultadas. Confira a conexão e seu acesso. Os itens não verificados não contam como concluídos.</p>}
    <Button size="sm" variant="ghost" className="mt-2" onClick={() => void setup.refresh()} disabled={setup.refreshing}>{setup.refreshing ? 'Verificando…' : 'Verificar novamente'}</Button>
  </section>;
}
