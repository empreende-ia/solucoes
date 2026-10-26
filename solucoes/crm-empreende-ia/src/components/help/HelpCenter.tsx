import { useEffect, useMemo, useState } from 'react';
import { SidePanel } from '@/components/foundation/SidePanel';
import { SectionLabel } from '@/components/foundation/Panel';
import { Input } from '@/components/ds/input';
import { Button } from '@/components/ds/button';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Search, Mail } from 'lucide-react';
import { TourHelpCatalog } from '@/components/tours';
import { CrmSetupChecklist } from '@/components/onboarding/CrmSetupChecklist';
import { useOnboardingGuide } from '@/components/onboarding/CrmOnboardingContext';
import { FAQ_CATEGORIES } from './faq-content';
import { SUPPORT_EMAIL } from '@/lib/support';

interface Props { open: boolean; onOpenChange: (open: boolean) => void }

export function HelpCenter({ open, onOpenChange }: Props) {
  const [query, setQuery] = useState('');
  const setup = useOnboardingGuide();
  const refresh = setup?.refresh;
  useEffect(() => { if (open) void refresh?.(); }, [open, refresh]);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return FAQ_CATEGORIES;
    return FAQ_CATEGORIES.map((category) => ({ ...category, items: category.items.filter((item) => `${item.q} ${item.a}`.toLocaleLowerCase().includes(normalized)) })).filter((category) => category.items.length > 0);
  }, [query]);

  return <SidePanel open={open} onOpenChange={onOpenChange} kicker="Aprender e configurar" title="Ajuda do CRM" description="Prepare sua operação, explore as ferramentas e tire dúvidas." width="lg" contentClassName="flex min-h-0 flex-col overflow-hidden p-0"
    footer={<div className="flex w-full flex-wrap items-center justify-between gap-2 text-xs leading-relaxed text-muted-foreground"><span>{SUPPORT_EMAIL ? 'Precisa de ajuda?' : 'Fale com o administrador da sua organização se precisar de ajuda.'}</span>{SUPPORT_EMAIL && <a href={`mailto:${SUPPORT_EMAIL}`} className="inline-flex items-center gap-1 text-primary hover:underline"><Mail className="h-3 w-3" aria-hidden="true" />Falar com suporte</a>}</div>}>
    <div className="shrink-0 border-b border-border px-4 py-3 sm:px-6"><label className="relative block"><span className="sr-only">Buscar nas perguntas frequentes</span><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" /><Input placeholder="Buscar nas perguntas frequentes…" value={query} onChange={(event) => setQuery(event.target.value)} className="h-10 pl-9" /></label></div>
    <div className="min-h-0 flex-1 space-y-8 overflow-y-auto px-4 py-5 sm:px-6">
      {!query.trim() && <><CrmSetupChecklist onOpenGuide={(stepId) => { onOpenChange(false); setup?.openGuide(stepId); }} /><TourHelpCatalog onNavigate={() => onOpenChange(false)} /></>}
      <section aria-labelledby="crm-faq-title"><h2 id="crm-faq-title" className="mb-4 text-base font-semibold">Perguntas frequentes</h2>
        {filtered.length === 0 ? <div className="rounded-xl border border-dashed border-border p-5 text-center"><p role="status" className="text-sm text-muted-foreground">Nenhuma resposta encontrada para “{query}”.</p><Button variant="ghost" size="sm" className="mt-2" onClick={() => setQuery('')}>Limpar busca</Button></div>
          : <Accordion type="multiple" className="space-y-5">{filtered.map((category) => <div key={category.id}><SectionLabel className="mb-2">{category.title}</SectionLabel>{category.items.map((item, index) => <AccordionItem key={`${category.id}-${index}`} value={`${category.id}-${index}`} className="mb-2 rounded-xl border border-border px-3"><AccordionTrigger className="py-3 text-left text-sm hover:no-underline">{item.q}</AccordionTrigger><AccordionContent className="text-sm leading-relaxed text-muted-foreground">{item.a}</AccordionContent></AccordionItem>)}</div>)}</Accordion>}
      </section>
    </div>
  </SidePanel>;
}
