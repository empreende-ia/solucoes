import type { Deal, DealActivity, DealDraft, DealFilters, DealStage, DealStatus } from './deal-types';

export const DEAL_STATUS_LABELS: Record<DealStatus, string> = { open: 'Em aberto', won: 'Ganha', lost: 'Perdida' };

export function parseDealValue(value: string): number | null {
  const normalized = value.trim().replace(',', '.');
  if (!/^(?:\d+)(?:\.\d{1,2})?$/.test(normalized)) return null;
  const number = Number(normalized);
  return Number.isFinite(number) && number <= 999999999999.99 ? number : null;
}

export function validateDealDraft(draft: DealDraft, stages: DealStage[]): Partial<Record<keyof DealDraft, string>> {
  const errors: Partial<Record<keyof DealDraft, string>> = {};
  if (!draft.title.trim()) errors.title = 'Dê um nome à oportunidade.';
  else if (draft.title.trim().length > 180) errors.title = 'Use até 180 caracteres.';
  if (!draft.pipeline_id) errors.pipeline_id = 'Selecione um pipeline.';
  if (!stages.some(stage => stage.id === draft.stage_id && stage.pipeline_id === draft.pipeline_id)) errors.stage_id = 'Escolha uma etapa deste pipeline.';
  if (parseDealValue(draft.value) === null) errors.value = 'Informe um valor positivo ou zero, com até duas casas decimais.';
  if (!/^[A-Z]{3}$/.test(draft.currency)) errors.currency = 'Selecione uma moeda válida.';
  const probability = Number(draft.probability);
  if (!draft.probability.trim() || !Number.isFinite(probability) || probability < 0 || probability > 100) errors.probability = 'A probabilidade deve estar entre 0 e 100%.';
  if (draft.close_date && (!/^\d{4}-\d{2}-\d{2}$/.test(draft.close_date) || !Number.isFinite(Date.parse(draft.close_date)) || new Date(draft.close_date).toISOString().slice(0, 10) !== draft.close_date)) errors.close_date = 'Informe uma data válida.';
  if (draft.status === 'won' && !draft.owner_id) errors.owner_id = 'Defina o responsável antes de marcar como ganha.';
  if (draft.status === 'lost' && !draft.lost_reason.trim()) errors.lost_reason = 'Informe por que a oportunidade foi perdida.';
  return errors;
}

export function validateDealMove(deal: Deal, stage: DealStage | undefined, status: DealStatus, lostReason = ''): string | null {
  if (!stage || stage.pipeline_id !== deal.pipeline_id || stage.org_id !== deal.org_id) return 'A etapa não pertence ao pipeline desta oportunidade.';
  if (!['open', 'won', 'lost'].includes(status)) return 'Situação inválida.';
  if (status === 'won' && !deal.owner_id) return 'Defina um responsável em Editar antes de marcar como ganha.';
  if (status === 'lost' && !lostReason.trim()) return 'Informe o motivo da perda.';
  return null;
}

export function filterDeals(deals: Deal[], filters: DealFilters): Deal[] {
  const search = filters.search.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return deals.filter(deal => {
    if (deal.pipeline_id !== filters.pipelineId) return false;
    if (filters.status !== 'all' && deal.status !== filters.status) return false;
    if (filters.ownerId === 'unassigned' ? deal.owner_id !== null : filters.ownerId !== 'all' && deal.owner_id !== filters.ownerId) return false;
    return !search || deal.title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes(search);
  });
}

export function summarizeDeals(deals: Deal[], currency: string, stages: DealStage[] = []) {
  const stageProbabilities = new Map(stages.map(stage => [stage.id, stage.win_probability]));
  const matching = deals.filter(deal => deal.currency === currency);
  const open = matching.filter(deal => deal.status === 'open');
  const sum = (items: Deal[], weighted = false) => Math.round(items.reduce((total, deal) => total + Math.round((Number(deal.value) || 0) * 100) * (weighted ? (deal.probability ?? stageProbabilities.get(deal.stage_id) ?? 0) / 100 : 1), 0)) / 100;
  return { count: deals.length, openCount: deals.filter(deal => deal.status === 'open').length, openValue: sum(open), weightedValue: sum(open, true), wonValue: sum(matching.filter(deal => deal.status === 'won')), foreignCurrencyCount: deals.length - matching.length };
}

export function daysInStage(enteredAt: string, now = new Date()): number | null {
  const timestamp = Date.parse(enteredAt);
  return Number.isFinite(timestamp) ? Math.max(0, Math.floor((now.getTime() - timestamp) / 86400000)) : null;
}

export function nextDealActions(activities: DealActivity[]): Map<string, DealActivity> {
  const result = new Map<string, DealActivity>();
  for (const activity of activities) {
    if (!activity.deal_id || activity.completed_at || activity.type === 'note' || !activity.due_date) continue;
    const due = Date.parse(activity.due_date);
    if (!Number.isFinite(due)) continue;
    const current = result.get(activity.deal_id);
    const currentDue = current ? Date.parse(current.due_date!) : Infinity;
    if (!current || due < currentDue || due === currentDue && activity.id.localeCompare(current.id) < 0) result.set(activity.deal_id, activity);
  }
  return result;
}

export function formatDealCurrency(value: number, currency = 'BRL'): string {
  try { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(value); }
  catch { return `${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} ${currency}`; }
}

export function dealDraft(deal?: Deal, pipelineId = '', stage?: DealStage, currency = 'BRL'): DealDraft {
  return {
    title: deal?.title ?? '', pipeline_id: deal?.pipeline_id ?? pipelineId, stage_id: deal?.stage_id ?? stage?.id ?? '',
    value: String(deal?.value ?? 0), currency: deal?.currency ?? currency, contact_id: deal?.contact_id ?? '',
    company_id: deal?.company_id ?? '', owner_id: deal?.owner_id ?? '', close_date: deal?.close_date ?? '',
    probability: String(deal?.probability ?? stage?.win_probability ?? 0), status: deal?.status ?? 'open', lost_reason: deal?.lost_reason ?? '',
  };
}
