import type { CrmSnapshot } from '@/hooks/useCrmSnapshot';
import { attentionQueue, activitySummary } from '@/lib/activity-logic';
import { contactName, normalizeSearch } from '@/lib/contact-model';

export interface CopilotEvidence { id: string; title: string; path: string; fact: string; suggestion?: { title: string; body: string; deal_id?: string; contact_id?: string } }
export interface CopilotAnswer { summary: string; evidence: CopilotEvidence[]; unknown: string[] }
type Topic = 'priorities' | 'stale-deals' | 'contacts' | 'deals';

// Only complete supported requests are commands. Words inside record names are not.
const topics = new Map<string, Topic>([
  ['o que priorizar hoje', 'priorities'], ['priorizar hoje', 'priorities'], ['priorizar', 'priorities'], ['prioridades', 'priorities'], ['resumo', 'priorities'],
  ['quais oportunidades estao paradas', 'stale-deals'], ['oportunidades paradas', 'stale-deals'],
  ['quais negocios estao parados', 'stale-deals'], ['negocios parados', 'stale-deals'],
  ['o que falta nos contatos', 'contacts'],
  ['quais oportunidades precisam de atencao', 'deals'],
]);

function namedEvidence(query: string, data: CrmSnapshot): CopilotEvidence[] {
  if (!query) return [];
  return [
    ...data.contacts.filter(contact => normalizeSearch(contactName(contact)).includes(query)).map(contact => ({
      id: `contact:${contact.id}`, title: contactName(contact), path: `/contacts?contact=${contact.id}`,
      fact: `Situação registrada: ${contact.status}. ${contact.owner_id ? 'Há um responsável definido.' : 'Não há responsável definido.'}`,
    })),
    ...data.deals.filter(deal => normalizeSearch(deal.title).includes(query)).map(deal => ({
      id: `deal:${deal.id}`, title: deal.title, path: `/pipeline?deal=${deal.id}`,
      fact: `Situação registrada: ${deal.status === 'open' ? 'em aberto' : deal.status === 'won' ? 'ganha' : 'perdida'}. Valor: ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: deal.currency }).format(deal.value)}.`,
    })),
  ];
}

/** Explainable record analysis; no external model, hidden score or invented client facts. */
export function copilotAnswer(question: string, data: CrmSnapshot, now = new Date()): CopilotAnswer {
  const query = normalizeSearch(question);
  const matches = namedEvidence(query, data);
  const exactName = matches.some(item => normalizeSearch(item.title) === query);
  const topic = exactName ? undefined : topics.get(query.replace(/[?!.]+$/, '').trim());
  const unknown = [
    'Não conheço conversas, acordos ou pagamentos que não estejam registrados no CRM.',
    'As sugestões são inferências operacionais para sua revisão; não são compromissos já combinados com o cliente.',
  ];

  if (!topic) {
    return {
      summary: matches.length
        ? `Encontrei ${matches.length > 6 ? 'estes 6 primeiros ' : 'estes '}registros correspondentes à busca por nome.`
        : 'Não encontrei contatos ou oportunidades com esse nome, nem reconheci uma pergunta de rotina suportada. Use uma das perguntas sugeridas ou digite o nome de um contato ou oportunidade.',
      evidence: matches.slice(0, 6), unknown,
    };
  }

  const staleRuleIds = new Set(data.riskRules.filter(rule => rule.enabled && rule.type === 'stale_deal').map(rule => rule.id));
  if (topic === 'stale-deals' && !staleRuleIds.size) return {
    summary: 'Não há regra ativa de oportunidades paradas. Não posso classificar quais estão paradas sem esse critério configurado.',
    evidence: [], unknown,
  };

  const queue = attentionQueue(data, now).filter(item => {
    if (topic === 'contacts') return item.key.startsWith('contact:');
    if (topic === 'deals') return item.key.startsWith('deal:');
    if (topic === 'stale-deals') return item.key.startsWith('deal:') && item.reasons.some(reason => staleRuleIds.has(reason.ruleId));
    return true;
  });
  const chosen = queue.slice(0, 6);
  const evidence = chosen.map(item => {
    const [kind, id] = item.key.split(':');
    const fact = item.reasons.map(reason => reason.explanation).join(' ');
    return {
      id: item.key, title: item.title, path: item.path, fact,
      suggestion: kind === 'deal' || kind === 'contact' ? {
        title: `Definir próximo passo: ${item.title}`, body: `Sugestão para revisão da equipe. Motivo observado: ${fact}`,
        ...(kind === 'deal' ? { deal_id: id } : { contact_id: id }),
      } : undefined,
    };
  });
  const summary = activitySummary(data.activities, now);
  return {
    summary: chosen.length
      ? `Encontrei ${chosen.length} ${chosen.length === 1 ? 'item' : 'itens'} para revisar${queue.length > 6 ? ' nesta seleção' : ''}. A ordem usa as regras de atenção configuradas pela organização.`
      : `Nenhum item corresponde às regras ativas deste recorte. Há ${summary.pending.length} atividades pendentes na organização; isso não significa que todos os relacionamentos estejam resolvidos.`,
    evidence, unknown,
  };
}
