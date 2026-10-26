import { useEffect, useState } from 'react';
import { ArrowRight, BrainCircuit, Check, Loader2, RefreshCw, X } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/Button';
import { Badge } from '@/components/ui/badge';
import type { AgentConfig } from '@/domain/agent-config';
import { suggestionsApi, type AgentSuggestion } from '@/services/suggestions';

const TYPE_LABELS: Record<AgentSuggestion['suggestion_type'], string> = {
  new_fact: 'Informação para confirmar',
  new_faq: 'FAQ para confirmar',
  new_example: 'Novo exemplo de conversa',
  new_test_scenario: 'Nova situação de teste',
  commercial_rule: 'Regra comercial',
  tone_adjustment: 'Ajuste de comunicação',
  handoff_rule: 'Regra de atendimento humano',
  missing_material: 'Material que está faltando',
};

export default function AgentSuggestionsPanel({
  editable,
  updateConfig,
  openKnowledge,
}: {
  editable: boolean;
  updateConfig: (updater: (current: AgentConfig) => AgentConfig) => void;
  openKnowledge: () => void;
}) {
  const [suggestions, setSuggestions] = useState<AgentSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [workingId, setWorkingId] = useState<string | null>(null);

  const load = async () => {
    try { setSuggestions(await suggestionsApi.fetchPending()); }
    catch { /* a migration pode ainda não estar publicada */ }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const analyze = async () => {
    setAnalyzing(true);
    try {
      const result = await suggestionsApi.analyze();
      setSuggestions(result.suggestions);
      toast.success(result.suggestions.length ? `${result.suggestions.length} sugestões aguardam sua revisão.` : 'Nenhuma melhoria concreta foi encontrada agora.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível analisar as conversas.');
    } finally { setAnalyzing(false); }
  };

  const reject = async (id: string) => {
    setWorkingId(id);
    try { await suggestionsApi.reject(id); setSuggestions((items) => items.filter((item) => item.id !== id)); }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Não foi possível rejeitar a sugestão.'); }
    finally { setWorkingId(null); }
  };

  const apply = async (suggestion: AgentSuggestion) => {
    setWorkingId(suggestion.id);
    try {
      if (suggestion.suggestion_type === 'new_fact') {
        await suggestionsApi.createFactForReview(suggestion);
        toast.success('Informação adicionada para confirmação em Conhecimento.');
        openKnowledge();
      } else if (suggestion.suggestion_type === 'new_faq') {
        await suggestionsApi.createFaqForReview(suggestion);
        toast.success('FAQ adicionada para confirmação em Conhecimento.');
        openKnowledge();
      } else if (suggestion.suggestion_type === 'new_test_scenario' || suggestion.suggestion_type === 'new_example') {
        await suggestionsApi.createTestScenario(suggestion);
        toast.success('Situação adicionada aos próximos testes.');
      } else if (suggestion.suggestion_type === 'handoff_rule') {
        const reason = String(suggestion.proposed_change.reason || '').trim();
        if (!reason) throw new Error('A sugestão não contém uma regra de atendimento humano.');
        // Aceite ANTES da mutação: se o registro falhar, o rascunho fica
        // intacto e a sugestão continua pendente — reaplicar não duplica.
        await suggestionsApi.acceptConfig(suggestion.id);
        updateConfig((current) => ({
          ...current,
          actions: current.actions.map((action) => action.actionId === 'human_handoff'
            ? { ...action, handoff: { ...action.handoff!, reasons: Array.from(new Set([...(action.handoff?.reasons ?? []), reason])) } }
            : action),
        }));
        toast.success('Regra adicionada ao rascunho.');
      } else if (suggestion.suggestion_type === 'missing_material') {
        openKnowledge();
        return;
      } else {
        const instruction = String(suggestion.proposed_change.instruction || '').trim();
        if (!instruction) throw new Error('A sugestão não contém uma instrução aplicável.');
        await suggestionsApi.acceptConfig(suggestion.id);
        updateConfig((current) => ({
          ...current,
          // Instrução já presente não é anexada de novo (reaplicar era duplicar).
          customInstructions: current.customInstructions.includes(instruction)
            ? current.customInstructions
            : [current.customInstructions, instruction].filter(Boolean).join('\n\n'),
        }));
        toast.success('Sugestão adicionada ao rascunho.');
      }
      setSuggestions((items) => items.filter((item) => item.id !== suggestion.id));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível aplicar a sugestão.');
    } finally { setWorkingId(null); }
  };

  return (
    <div className="eia-card p-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div className="flex items-start gap-3"><BrainCircuit className="mt-0.5 h-5 w-5 text-primary" /><div><p className="eia-eyebrow">Aprendizado assistido</p><h3 className="mt-1 text-base font-semibold text-foreground">Melhorias encontradas nas conversas</h3><p className="mt-1 max-w-2xl text-sm text-muted-foreground">A IA procura padrões e lacunas, mas você decide o que entra no rascunho. Falas do cliente nunca viram verdade da empresa automaticamente.</p></div></div>
        <Button variant="secondary" size="sm" disabled={!editable || analyzing} onClick={() => void analyze()}>{analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}{analyzing ? 'Analisando…' : 'Analisar conversas'}</Button>
      </div>
      {loading ? <div className="mt-5 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando sugestões…</div> : suggestions.length === 0 ? <p className="mt-5 rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">Nenhuma sugestão pendente. A análise é sempre iniciada por você.</p> : <div className="mt-5 space-y-3">{suggestions.map((suggestion) => <div key={suggestion.id} className="rounded-xl border border-border p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><Badge variant="muted">{TYPE_LABELS[suggestion.suggestion_type]}</Badge><h4 className="mt-2 text-sm font-semibold text-foreground">{suggestion.title}</h4></div></div><p className="mt-2 text-sm text-muted-foreground">{suggestion.rationale}</p>{suggestion.evidence.quote && <blockquote className="mt-3 rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">“{suggestion.evidence.quote}”</blockquote>}<div className="mt-4 flex flex-wrap gap-2"><Button variant="primary" size="sm" disabled={!editable || workingId !== null} onClick={() => void apply(suggestion)}>{workingId === suggestion.id ? <Loader2 className="h-4 w-4 animate-spin" /> : suggestion.suggestion_type === 'missing_material' ? <ArrowRight className="h-4 w-4" /> : <Check className="h-4 w-4" />}{suggestion.suggestion_type === 'new_fact' ? 'Levar para confirmação' : suggestion.suggestion_type === 'new_test_scenario' ? 'Adicionar aos testes' : suggestion.suggestion_type === 'missing_material' ? 'Abrir conhecimento' : 'Adicionar ao rascunho'}</Button><Button variant="ghost" size="sm" disabled={!editable || workingId !== null} onClick={() => void reject(suggestion.id)}><X className="h-4 w-4" />Ignorar</Button></div></div>)}</div>}
    </div>
  );
}
