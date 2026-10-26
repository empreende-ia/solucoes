import { describe, expect, it, vi } from 'vitest';
import { productTours } from './catalog';
import { emptyTourPreferences, parseTourPreferences, pausedTour, placeTourCard, readTourPreferences, recordTourVisit, resumeTourIndex, shouldAutomaticallyStartTour, shouldOfferTour, tourStorageKey, writeTourPreferences } from './tour-state';

const tour = productTours[1];

describe('orientation progress and isolation', () => {
  it('defaults to explicit opt-in and keeps replay possible after a dismissal or completion', () => {
    const initial = emptyTourPreferences();
    expect(initial.automatic).toBe(false);
    expect(shouldOfferTour(initial, tour)).toBe(true);
    expect(shouldAutomaticallyStartTour(initial, tour)).toBe(false);
    for (const status of ['dismissed', 'completed'] as const) {
      const next = recordTourVisit({ ...initial, automatic: true }, tour, status);
      expect(shouldOfferTour(next, tour)).toBe(false);
      expect(shouldAutomaticallyStartTour(next, tour)).toBe(false);
      expect(resumeTourIndex(next, tour, tour.steps)).toBe(0);
    }
  });

  it('resumes by stable step ID after earlier targets become unavailable', () => {
    const preferences = recordTourVisit(emptyTourPreferences(), tour, 'paused', 'contacts-list');
    const visible = tour.steps.filter((step) => step.id !== 'contacts-search' && step.id !== 'contacts-filters');
    expect(visible[resumeTourIndex(preferences, tour, visible)].id).toBe('contacts-list');
    expect(shouldAutomaticallyStartTour({ ...preferences, automatic: true }, tour)).toBe(false);
  });

  it('advances to the nearest available step when the paused target is hidden by a permission or layout change', () => {
    const preferences = recordTourVisit(emptyTourPreferences(), tour, 'paused', 'contacts-views');
    const visible = tour.steps.filter((step) => step.id !== 'contacts-views');
    expect(visible[resumeTourIndex(preferences, tour, visible)].id).toBe('contacts-list');
    const lastPaused = recordTourVisit(preferences, tour, 'paused', 'contacts-create');
    expect(resumeTourIndex(lastPaused, tour, visible.slice(0, -1))).toBe(visible.length - 2);
  });

  it('invalidates an incompatible pause without losing preferences on a new version', () => {
    const preferences = recordTourVisit({ ...emptyTourPreferences(), invitations: false }, tour, 'paused', 'contacts-list');
    const updated = { ...tour, version: tour.version + 1 };
    expect(pausedTour(preferences, updated)).toBeNull();
    expect(resumeTourIndex(preferences, updated, updated.steps)).toBe(0);
    expect(shouldAutomaticallyStartTour(preferences, updated)).toBe(false);
    expect(shouldOfferTour(preferences, updated)).toBe(false);
    const saved = recordTourVisit(preferences, updated, 'completed');
    expect(saved.invitations).toBe(false);
    expect(saved.automatic).toBe(false);
    expect(saved.visits.contacts.version).toBe(updated.version);
  });

  it('offers a relevant update once per version and never auto-resumes a pause', () => {
    const saved = recordTourVisit({ ...emptyTourPreferences(), automatic: true }, tour, 'completed');
    expect(shouldOfferTour(saved, { ...tour, version: 2 })).toBe(true);
    expect(shouldAutomaticallyStartTour(saved, { ...tour, version: 2 })).toBe(true);
    expect(shouldAutomaticallyStartTour(recordTourVisit(saved, tour, 'paused', tour.steps[0].id), tour)).toBe(false);
  });

  it('encodes both scope dimensions without collisions or anonymous persistence', () => {
    expect(tourStorageKey(null)).toBeNull();
    expect(tourStorageKey({ userId: '', orgId: 'a' })).toBeNull();
    const keys = [
      { userId: 'user:one', orgId: 'company/two' },
      { userId: 'one', orgId: 'company/two:user' },
      { userId: 'user:one', orgId: 'other' },
      { userId: 'another', orgId: 'company/two' },
    ].map(tourStorageKey);
    expect(new Set(keys).size).toBe(4);
    expect(keys[0]).toBe('empreende-crm:tours:v1:company%2Ftwo:user%3Aone');
  });

  it('recovers from corrupt data and whitelists fields instead of retaining personal/form data', () => {
    expect(parseTourPreferences('{broken')).toEqual(emptyTourPreferences());
    expect(parseTourPreferences('null')).toEqual(emptyTourPreferences());
    expect(parseTourPreferences(JSON.stringify({ version: 2, automatic: true }))).toEqual(emptyTourPreferences());
    const parsed = parseTourPreferences(JSON.stringify({
      version: 1, automatic: false, invitations: false, email: 'private@example.com',
      visits: {
        contacts: { version: 1, status: 'paused', stepId: 'contacts-list', contact: 'Personal content' },
        dashboard: { version: 1, status: 'completed', email: 'private@example.com' },
        'invalid id': { version: 1, status: 'completed' },
        tasks: { version: -1, status: 'completed' },
        agenda: { version: 1, status: 'paused', stepId: 'email@example.com' },
      },
    }));
    expect(parsed.visits).toEqual({ contacts: { version: 1, status: 'paused', stepId: 'contacts-list' }, dashboard: { version: 1, status: 'completed' } });
    expect(JSON.stringify(parsed)).not.toMatch(/private|Personal|email/);
  });

  it('keeps fallback memory across remounts and isolates it when storage denies access', () => {
    const key = tourStorageKey({ orgId: 'denied-a', userId: 'user' });
    const other = tourStorageKey({ orgId: 'denied-b', userId: 'user' });
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('denied'); });
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('denied'); });
    const saved = recordTourVisit(emptyTourPreferences(), tour, 'paused', 'contacts-list');
    writeTourPreferences(key, saved);
    expect(readTourPreferences(key)).toEqual(saved);
    expect(readTourPreferences(other)).toEqual(emptyTourPreferences());
    expect(readTourPreferences(null)).toEqual(emptyTourPreferences());
    get.mockRestore(); set.mockRestore();
  });

  it('respects an explicit storage reset instead of reviving already persisted memory', () => {
    const key = tourStorageKey({ orgId: 'reset-org', userId: 'reset-user' })!;
    writeTourPreferences(key, recordTourVisit(emptyTourPreferences(), tour, 'completed'));
    expect(readTourPreferences(key).visits.contacts.status).toBe('completed');
    localStorage.removeItem(key);
    expect(readTourPreferences(key)).toEqual(emptyTourPreferences());
  });
});

describe('catalog contracts and small viewports', () => {
  it('has eight commercial guides with 3–5 unique stable steps and exact attribute selectors', () => {
    expect(productTours.map((item) => item.id)).toEqual(['dashboard', 'contacts', 'pipeline', 'agenda', 'tasks', 'financeiro', 'automations', 'integrations']);
    expect(new Set(productTours.map((item) => item.id)).size).toBe(8);
    for (const item of productTours) {
      expect(item.steps.length).toBeGreaterThanOrEqual(3);
      expect(item.steps.length).toBeLessThanOrEqual(5);
      expect(new Set(item.steps.map((step) => step.id)).size).toBe(item.steps.length);
      for (const step of item.steps) expect(step.target).toBe(`[data-tour="${step.id}"]`);
    }
  });

  it.each([
    { top: 0, left: 0, width: 320, height: 568 },
    { top: 120, left: 15, width: 320, height: 200 },
    { top: 0, left: 0, width: 568, height: 100 },
    { top: 30, left: 40, width: 250, height: 220 },
    { top: 0, left: 0, width: 1280, height: 720 },
  ])('contains the full card with keyboard/zoom viewport %j', (viewport) => {
    const positioned = placeTourCard({ top: 900, left: 1100, width: 500, height: 300 }, viewport, { width: 360, height: 600 });
    expect(positioned.left).toBeGreaterThanOrEqual(viewport.left);
    expect(positioned.top).toBeGreaterThanOrEqual(viewport.top);
    expect(positioned.left + positioned.width).toBeLessThanOrEqual(viewport.left + viewport.width);
    expect(positioned.top + positioned.height).toBeLessThanOrEqual(viewport.top + viewport.height);
  });
});
