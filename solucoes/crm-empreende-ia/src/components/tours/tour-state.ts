import type { ProductTourDefinition, ProductTourStep, TourPreferences, TourScope, TourVisit } from './types';

const stableId = /^[a-z][a-z0-9-]{0,100}$/;
const memory = new Map<string, TourPreferences>();
const unpersisted = new Set<string>();

export function emptyTourPreferences(): TourPreferences {
  return { version: 1, automatic: false, invitations: true, visits: {} };
}

export function tourStorageKey(scope: TourScope | null): string | null {
  if (!scope?.orgId || !scope.userId) return null;
  return `empreende-crm:tours:v1:${encodeURIComponent(scope.orgId)}:${encodeURIComponent(scope.userId)}`;
}

/** Reconstruct only the orientation fields, dropping unknown fields and invalid data. */
export function parseTourPreferences(raw: string | null): TourPreferences {
  const fallback = emptyTourPreferences();
  if (!raw || raw.length > 100_000) return fallback;
  try {
    const value = JSON.parse(raw);
    if (!value || value.version !== 1 || typeof value.automatic !== 'boolean') return fallback;
    const visits: TourPreferences['visits'] = {};
    for (const [id, entry] of Object.entries(value.visits || {}).slice(0, 200)) {
      if (!stableId.test(id) || !entry || typeof entry !== 'object') continue;
      const item = entry as Record<string, unknown>;
      if (!Number.isSafeInteger(item.version) || Number(item.version) < 1) continue;
      const version = Number(item.version);
      if (item.status === 'completed' || item.status === 'dismissed') visits[id] = { version, status: item.status };
      else if (item.status === 'paused' && typeof item.stepId === 'string' && stableId.test(item.stepId)) {
        visits[id] = { version, status: 'paused', stepId: item.stepId };
      }
    }
    return { version: 1, automatic: value.automatic, invitations: typeof value.invitations === 'boolean' ? value.invitations : true, visits };
  } catch {
    return fallback;
  }
}

export function readTourPreferences(key: string | null): TourPreferences {
  if (!key) return emptyTourPreferences();
  try {
    const raw = localStorage.getItem(key);
    if (!raw && unpersisted.has(key) && memory.has(key)) return memory.get(key)!;
    const value = parseTourPreferences(raw);
    memory.set(key, value);
    return value;
  } catch {
    return memory.get(key) ?? emptyTourPreferences();
  }
}

export function writeTourPreferences(key: string | null, value: TourPreferences): void {
  if (!key) return;
  const clean = parseTourPreferences(JSON.stringify(value));
  memory.set(key, clean);
  try {
    localStorage.setItem(key, JSON.stringify(clean));
    unpersisted.delete(key);
  } catch {
    unpersisted.add(key); // Storage may be unavailable; session memory remains isolated by scope.
  }
}

export function recordTourVisit(preferences: TourPreferences, tour: ProductTourDefinition, status: TourVisit['status'], stepId?: string): TourPreferences {
  if (status === 'paused' && !tour.steps.some((step) => step.id === stepId)) return preferences;
  const visit: TourVisit = status === 'paused'
    ? { version: tour.version, status, stepId: stepId! }
    : { version: tour.version, status };
  return { ...preferences, visits: { ...preferences.visits, [tour.id]: visit } };
}

export function pausedTour(preferences: TourPreferences, tour: ProductTourDefinition): TourVisit & { status: 'paused' } | null {
  const visit = preferences.visits[tour.id];
  return visit?.version === tour.version && visit.status === 'paused' && tour.steps.some((step) => step.id === visit.stepId) ? visit : null;
}

export function resumeTourIndex(preferences: TourPreferences, tour: ProductTourDefinition, visible: ProductTourStep[]): number {
  const visit = pausedTour(preferences, tour);
  if (!visit || !visible.length) return 0;
  const exact = visible.findIndex((step) => step.id === visit.stepId);
  if (exact >= 0) return exact;
  const originalIndex = tour.steps.findIndex((step) => step.id === visit.stepId);
  const next = visible.findIndex((step) => tour.steps.findIndex((candidate) => candidate.id === step.id) > originalIndex);
  return next >= 0 ? next : visible.length - 1;
}

export function shouldOfferTour(preferences: TourPreferences, tour: ProductTourDefinition): boolean {
  return preferences.invitations && preferences.visits[tour.id]?.version !== tour.version;
}

export function shouldAutomaticallyStartTour(preferences: TourPreferences, tour: ProductTourDefinition): boolean {
  return preferences.automatic && preferences.visits[tour.id]?.version !== tour.version;
}

export interface TourRect { top: number; left: number; width: number; height: number }

/** Adapted from Lara; keep the complete card inside the visual viewport, including keyboards. */
export function placeTourCard(target: TourRect, viewport: TourRect, card: { width: number; height: number }): TourRect {
  const gap = 14;
  const margin = Math.min(12, viewport.width / 4, viewport.height / 4);
  const width = Math.max(0, Math.min(card.width, viewport.width - margin * 2));
  const height = Math.max(0, Math.min(card.height, viewport.height - margin * 2));
  const minX = viewport.left + margin;
  const minY = viewport.top + margin;
  const maxX = Math.max(minX, viewport.left + viewport.width - width - margin);
  const maxY = Math.max(minY, viewport.top + viewport.height - height - margin);
  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
  let left = target.left;
  let top = target.top + target.height + gap;
  if (viewport.width < 640) { left = minX; top = maxY; }
  else if (top > maxY) {
    if (target.top - height - gap >= minY) top = target.top - height - gap;
    else if (target.left + target.width + width + gap <= viewport.left + viewport.width - margin) { left = target.left + target.width + gap; top = target.top; }
    else if (target.left - width - gap >= minX) { left = target.left - width - gap; top = target.top; }
    else top = maxY;
  }
  return { left: clamp(left, minX, maxX), top: clamp(top, minY, maxY), width, height };
}
