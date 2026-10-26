import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nextAction, type RelationshipActivity } from '@/lib/contact-model';

const fixture = vi.hoisted(() => ({
  rows: {} as Record<string, Record<string, unknown>[]>,
  failures: {} as Record<string, 'network' | 'permission'>,
  requests: [] as { url: URL; method: string }[],
}));

// Exercise the real Supabase/PostgREST builder and its HTTP request, with no backend access.
// Filters precede limit, so an unrelated first row cannot hide a valid action.
vi.mock('@/integrations/supabase/crm-client', async () => {
  const { createClient } = await import('@supabase/supabase-js');
  const crmDb = createClient('https://onboarding-fixture.test', 'sb_publishable_fixture_test', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (input, init) => {
      const url = new URL(String(input));
      fixture.requests.push({ url, method: init?.method ?? 'GET' });
      const table = url.pathname.split('/').pop()!;
      if (fixture.failures[table] === 'network') throw new Error('Network error');
      if (fixture.failures[table] === 'permission') return new Response(JSON.stringify({ code: '42501', message: 'permission denied' }), { status: 403 });
      let rows = fixture.rows[table] ?? [];
      for (const [column, filter] of url.searchParams) {
        if (filter.startsWith('eq.')) rows = rows.filter(row => String(row[column]) === filter.slice(3));
        else if (filter.startsWith('neq.')) rows = rows.filter(row => row[column] != null && String(row[column]) !== filter.slice(4));
        else if (filter === 'is.null') rows = rows.filter(row => row[column] == null);
        else if (filter === 'not.is.null') rows = rows.filter(row => row[column] != null);
      }
      if (url.searchParams.has('limit')) rows = rows.slice(0, Number(url.searchParams.get('limit')));
      const columns = url.searchParams.get('select')?.split(',') ?? [];
      return new Response(JSON.stringify(rows.map(row => Object.fromEntries(columns.map(column => [column, row[column]])))), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    } },
  });
  return { crmDb };
});
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: null, profile: null }) }));

import { fetchSetupEvidence } from './useCrmOnboarding';

const action = (overrides: Partial<RelationshipActivity> = {}): RelationshipActivity => ({
  id: 'activity', org_id: 'org', type: 'task', title: 'Retomar proposta', body: null,
  contact_id: null, company_id: null, deal_id: null, user_id: 'user',
  due_date: '2026-09-10T10:00:00Z', end_date: null, completed_at: null,
  created_at: '2026-09-01T10:00:00Z', updated_at: '2026-09-01T10:00:00Z', created_by: 'user', ...overrides,
});
const readEvidence = () => fetchSetupEvidence('org', 'user', new AbortController().signal);
beforeEach(() => { fixture.rows = {}; fixture.failures = {}; fixture.requests = []; });

describe('configuration evidence queries', () => {
  it('only marks configuration complete from actual names and existing commercial records', async () => {
    for (const table of ['pipelines', 'pipeline_stages', 'contacts', 'deals']) fixture.rows[table] = [{ id: 'record', org_id: 'org' }];
    fixture.rows.activities = [action()];
    fixture.rows.organizations = [{ id: 'org', name: 'Empreende IA' }];
    fixture.rows.profiles = [{ id: 'user', org_id: 'org', name: 'Pessoa' }];
    expect(await readEvidence()).toEqual({ identity: 'done', pipeline: 'done', contact: 'done', opportunity: 'done', activity: 'done' });
  });
  it('does not accept a pipeline without stages or an organization without a named profile', async () => {
    fixture.rows.organizations = [{ id: 'org', name: 'Empreende IA' }];
    fixture.rows.profiles = [{ id: 'user', org_id: 'org', name: '  ', onboarding_completed: true }];
    fixture.rows.pipelines = [{ id: 'pipeline', org_id: 'org' }];
    const result = await readEvidence();
    expect(result.identity).toBe('pending');
    expect(result.pipeline).toBe('pending');
  });
  it('keeps partial failures explicit and does not turn a failed query into empty or completed', async () => {
    fixture.rows.contacts = [{ id: 'contact', org_id: 'org' }];
    fixture.failures.deals = 'permission';
    fixture.failures.activities = 'network';
    const result = await readEvidence();
    expect(result.contact).toBe('done');
    expect(result.opportunity).toBe('error');
    expect(result.activity).toBe('error');
  });
  it('scopes every query, requests minimal fields, and never writes onboarding flags or records', async () => {
    await fetchSetupEvidence('org-a', 'user-a', new AbortController().signal);
    expect(fixture.requests.map(({ url }) => url.pathname.split('/').pop()).sort()).toEqual(['organizations', 'profiles', 'pipelines', 'pipeline_stages', 'contacts', 'deals', 'activities'].sort());
    for (const { url, method } of fixture.requests) {
      const table = url.pathname.split('/').pop();
      expect(method).toBe('GET');
      expect(url.searchParams.get(table === 'organizations' ? 'id' : 'org_id')).toBe('eq.org-a');
      expect(['name', 'id', 'id,type,due_date,completed_at']).toContain(url.searchParams.get('select'));
      if (!['organizations', 'profiles'].includes(table!)) expect(url.searchParams.get('limit')).toBe('1');
    }
    const profile = fixture.requests.find(({ url }) => url.pathname.endsWith('/profiles'))!.url;
    expect(profile.searchParams.get('id')).toBe('eq.user-a');
  });
});

describe('next action readiness follows the canonical activity semantics', () => {
  it.each([
    ['note', { type: 'note' }],
    ['completed task', { completed_at: '2026-09-09T10:00:00Z' }],
    ['unscheduled task', { due_date: null }],
    ['malformed deadline', { due_date: 'invalid' }],
    ['non-finite deadline', { due_date: 'infinity' }],
    ['another organization', { org_id: 'other-org' }],
  ] as [string, Partial<RelationshipActivity>][])('does not complete the step for %s', async (_label, overrides) => {
    const rows = [action(overrides)];
    fixture.rows.activities = rows;
    expect(nextAction(rows.filter(row => row.org_id === 'org'))).toBeNull();
    expect((await readEvidence()).activity).toBe('pending');
  });
  it.each(['task', 'call', 'email', 'meeting'])('accepts a pending %s with a deadline', async type => {
    const rows = [action({ type })];
    fixture.rows.activities = rows;
    expect(nextAction(rows)?.id).toBe('activity');
    expect((await readEvidence()).activity).toBe('done');
  });
  it('counts overdue work as a next action and does not invent a future-only requirement', async () => {
    const rows = [action({ due_date: '2020-01-01T10:00:00Z' })];
    fixture.rows.activities = rows;
    expect(nextAction(rows)?.id).toBe('activity');
    expect((await readEvidence()).activity).toBe('done');
  });
  it('finds an eligible action after unrelated rows and reopens the step when it is completed', async () => {
    const eligible = action({ id: 'eligible' });
    const rows = [
      action({ id: 'note', type: 'note' }), action({ id: 'completed', completed_at: '2026-09-02T10:00:00Z' }),
      action({ id: 'unscheduled', due_date: null }), action({ id: 'foreign', org_id: 'other-org' }), eligible,
    ];
    fixture.rows.activities = rows;
    expect(nextAction(rows.filter(row => row.org_id === 'org'))?.id).toBe('eligible');
    expect((await readEvidence()).activity).toBe('done');
    eligible.completed_at = '2026-09-10T11:00:00Z';
    expect(nextAction(rows.filter(row => row.org_id === 'org'))).toBeNull();
    expect((await readEvidence()).activity).toBe('pending');
  });
  it('keeps missing activities pending and activity permission errors explicit', async () => {
    expect((await readEvidence()).activity).toBe('pending');
    fixture.failures.activities = 'permission';
    expect((await readEvidence()).activity).toBe('error');
  });
});
