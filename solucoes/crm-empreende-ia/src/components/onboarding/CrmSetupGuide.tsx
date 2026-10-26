import { useRef } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, CheckCircle2, CircleAlert, X } from 'lucide-react';
import { Button } from '@/components/ds/button';
import { useCrmPermissions } from '@/hooks/useCrmPermissions';
import { useOnboardingGuide } from './CrmOnboardingContext';
import { SETUP_STEPS } from './setup-state';

export function CrmSetupGuide() {
  const setup = useOnboardingGuide();
  const permissions = useCrmPermissions();
  const navigate = useNavigate();
  const heading = useRef<HTMLHeadingElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  if (!setup) return null;
  const index = Math.max(0, SETUP_STEPS.findIndex((step) => step.id === setup.stepId));
  const step = SETUP_STEPS[index];
  const status = setup.evidence[step.id];
  const canConfigure = !step.admin || permissions.canManage;

  return <Dialog.Root open={setup.open} onOpenChange={(open) => { if (!open) setup.closeGuide(); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-[160] bg-black/60" />
      <Dialog.Content className="fixed left-1/2 top-1/2 z-[161] flex max-h-[calc(100dvh_-_24px)] w-[calc(100%_-_24px)] max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-background text-foreground shadow-2xl focus:outline-none"
        onOpenAutoFocus={(event) => { event.preventDefault(); returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; heading.current?.focus(); }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          const previous = returnFocus.current;
          if (previous?.isConnected && previous !== document.body && previous.getClientRects().length) previous.focus({ preventScroll: true });
          else document.querySelector<HTMLElement>('[data-tour-focus-fallback]')?.focus({ preventScroll: true });
        }}>
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-4 py-4 sm:px-6">
          <div><Dialog.Title ref={heading} tabIndex={-1} className="text-lg font-semibold outline-none">Configurar CRM</Dialog.Title><Dialog.Description className="mt-1 text-xs leading-relaxed text-muted-foreground">Um guia para preparar a operação. Você pode sair com Esc e continuar depois.</Dialog.Description></div>
          <Dialog.Close className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Pausar configuração"><X className="h-4 w-4" aria-hidden="true" /></Dialog.Close>
        </div>
        <div className="min-h-0 overflow-y-auto px-4 py-5 sm:px-6">
          <nav aria-label="Etapas da configuração" className="mb-5 flex flex-wrap gap-2">
            {SETUP_STEPS.map((item, position) => <button key={item.id} type="button" onClick={() => setup.selectStep(item.id)} aria-label={`Etapa ${position + 1}: ${item.title}`} aria-current={item.id === step.id ? 'step' : undefined}
              className={`flex h-9 min-w-9 items-center justify-center rounded-full border px-2 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${item.id === step.id ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:bg-secondary'}`}>
              {setup.evidence[item.id] === 'done' ? <><CheckCircle2 aria-hidden="true" className="h-4 w-4" /><span className="sr-only">Verificada</span></> : position + 1}
            </button>)}
          </nav>
          <p aria-live="polite" aria-atomic="true" className="text-xs font-medium text-primary">Etapa {index + 1} de {SETUP_STEPS.length}</p>
          <h3 className="mt-2 text-xl font-semibold tracking-tight">{step.title}</h3>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{step.description}</p>
          <div className="mt-5 rounded-xl border border-border bg-muted/30 p-4">
            {setup.loading ? <p role="status" className="text-sm">Verificando registros…</p> : <p role={status === 'error' ? 'alert' : 'status'} className="flex items-start gap-2 text-sm leading-relaxed">
              {status === 'done' ? <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> : status === 'error' ? <CircleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-destructive" /> : null}
              <span>{status === 'done' ? 'Esta etapa está verificada nos registros atuais do CRM.' : status === 'error' ? 'Não foi possível verificar esta etapa. Confira seu acesso e tente consultar novamente.' : 'Esta etapa ainda precisa ser preparada nos registros do CRM.'}</span>
            </p>}
            <Button variant="ghost" size="sm" className="mt-2" onClick={() => void setup.refresh()} disabled={setup.refreshing}>{setup.refreshing ? 'Verificando…' : 'Verificar novamente'}</Button>
          </div>
          <div className="mt-5 flex flex-wrap gap-2"><Button className="h-auto min-h-10 whitespace-normal py-2.5" onClick={() => { setup.closeGuide(); navigate(step.path); }} disabled={!canConfigure || permissions.loading}>{step.action}<ArrowRight className="ml-2 h-4 w-4 shrink-0" aria-hidden="true" /></Button>
          {step.id === 'identity' && <Button variant="outline" className="h-auto min-h-10 whitespace-normal py-2.5" onClick={() => { setup.closeGuide(); navigate('/settings?tab=profile'); }}>Abrir meu perfil</Button>}</div>
          {!canConfigure && <p className="mt-2 text-xs leading-relaxed text-muted-foreground">A configuração de pipelines exige um administrador da organização. Você pode continuar pelas demais etapas.</p>}
          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">O guia abre as telas de trabalho. Avançar aqui não cria registros nem marca a configuração como concluída. Seus dados salvos ficam preservados ao sair.</p>
        </div>
        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3 sm:px-6">
          <Button variant="ghost" size="sm" onClick={() => setup.selectStep(SETUP_STEPS[index - 1].id)} disabled={index === 0}><ArrowLeft className="mr-1 h-4 w-4" aria-hidden="true" />Voltar</Button>
          {index < SETUP_STEPS.length - 1 ? <Button size="sm" onClick={() => setup.selectStep(SETUP_STEPS[index + 1].id)}>Próxima etapa<ArrowRight className="ml-1 h-4 w-4" aria-hidden="true" /></Button> : <Button size="sm" onClick={setup.closeGuide}>Voltar ao CRM</Button>}
        </footer>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
