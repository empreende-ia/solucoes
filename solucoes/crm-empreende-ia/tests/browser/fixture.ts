import type { Page, Route } from '@playwright/test';
import { randomUUID } from 'node:crypto';

export const IDS = { org: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', otherOrg: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', owner: '11111111-1111-4111-8111-111111111111', viewer: '22222222-2222-4222-8222-222222222222', contact: '33333333-3333-4333-8333-333333333333', otherContact: '33333333-3333-4333-8333-333333333334', company: '44444444-4444-4444-8444-444444444444', pipeline: '55555555-5555-4555-8555-555555555555', stage: '66666666-6666-4666-8666-666666666666', stage2: '66666666-6666-4666-8666-666666666667', deal: '77777777-7777-4777-8777-777777777777', activity: '88888888-8888-4888-8888-888888888888', meeting: '88888888-8888-4888-8888-888888888889' } as const;
export type FixtureRow = Record<string, unknown> & { id: string };
export interface FixtureState {
  tables: Record<string, FixtureRow[]>;
  requests: { method: string; table: string; params: string; body: unknown }[];
  failReads: Set<string>;
  failWrites: Set<string>;
  loseNextWriteResponse: Set<string>;
  userId: string;
}
const dayAt = (offset: number, hour = 10) => { const d = new Date(); d.setDate(d.getDate() + offset); d.setHours(hour, 0, 0, 0); return d.toISOString(); };
export function createFixture(role: 'owner' | 'viewer' | 'member' = 'owner'): FixtureState {
  const now = new Date().toISOString(), old = dayAt(-10), userId = role !== 'viewer' ? IDS.owner : IDS.viewer;
  const base = { org_id: IDS.org, created_at: old, updated_at: old };
  return { userId, requests: [], failReads: new Set(), failWrites: new Set(), loseNextWriteResponse: new Set(), tables: {
    organizations: [{ id: IDS.org, name: 'Organização de Teste A', industry: 'other', metadata: {}, created_at: old, updated_at: old }, { id: IDS.otherOrg, name: 'Organização de Teste B', created_at: old, updated_at: old }],
    profiles: [{ id: IDS.owner, ...base, name: 'Pessoa de Teste', email: 'owner@example.test', avatar_url: null }, { id: IDS.viewer, ...base, name: 'Leitor de Teste', email: 'viewer@example.test', avatar_url: null }],
    user_roles: [{ id: randomUUID(), org_id: IDS.org, user_id: IDS.owner, role: role === 'member' ? 'member' : 'owner' }, { id: randomUUID(), org_id: IDS.org, user_id: IDS.viewer, role: 'viewer' }],
    contacts: [{ id: IDS.contact, ...base, first_name: 'Contato', last_name: 'Alfa', email: 'alfa@example.test', phone: '11900000000', company_id: IDS.company, owner_id: IDS.owner, status: 'lead', job_title: null, source: null, notes: null }, { id: IDS.otherContact, org_id: IDS.otherOrg, first_name: 'Contato', last_name: 'de outra organização', email: 'outra@example.test', created_at: old, updated_at: old, status: 'lead', owner_id: null }],
    companies: [{ id: IDS.company, ...base, name: 'Empresa Exemplo', domain: 'example.test', industry: 'Serviços', size: null, revenue: null, website: 'https://example.test', linkedin_url: null, owner_id: IDS.owner, phone: '1130000000' }],
    pipelines: [{ id: IDS.pipeline, ...base, name: 'Comercial', currency: 'BRL', is_default: true }],
    pipeline_stages: [{ id: IDS.stage, ...base, pipeline_id: IDS.pipeline, name: 'Entrada', order: 0, win_probability: 10, color: null }, { id: IDS.stage2, ...base, pipeline_id: IDS.pipeline, name: 'Proposta', order: 1, win_probability: 50, color: null }],
    deals: [{ id: IDS.deal, ...base, pipeline_id: IDS.pipeline, stage_id: IDS.stage, title: 'Projeto Exemplo', value: 2400, currency: 'BRL', contact_id: IDS.contact, company_id: IDS.company, owner_id: IDS.owner, close_date: null, probability: 10, status: 'open', lost_reason: null, stage_entered_at: old }],
    activities: [{ id: IDS.activity, ...base, title: 'Retorno de teste', type: 'task', body: 'Contexto fictício para validação.', due_date: dayAt(-1), end_date: null, completed_at: null, contact_id: IDS.contact, company_id: IDS.company, deal_id: IDS.deal, user_id: IDS.owner, created_by: IDS.owner }, { id: IDS.meeting, ...base, title: 'Reunião de teste', type: 'meeting', body: null, due_date: dayAt(0, 14), end_date: dayAt(0, 15), completed_at: null, contact_id: IDS.contact, company_id: IDS.company, deal_id: IDS.deal, user_id: IDS.owner, created_by: IDS.owner }],
    risk_rules: ['overdue', 'no_owner', 'no_next_action', 'stale_deal'].map((type, i) => ({ id: randomUUID(), org_id: IDS.org, type, name: ['Atividades vencidas', 'Sem responsável', 'Sem próxima ação', 'Oportunidades paradas'][i], enabled: true, threshold_days: 7, priority: i === 0 ? 1 : 2 })),
    deal_stage_history: [{ id: randomUUID(), org_id: IDS.org, deal_id: IDS.deal, from_stage_id: null, to_stage_id: IDS.stage, from_status: null, to_status: 'open', changed_by: IDS.owner, created_at: old }],
    payments: [{ id: randomUUID(), ...base, deal_id: IDS.deal, contact_id: IDS.contact, description: 'Recebimento de teste', amount: 1200, currency: 'BRL', due_date: now.slice(0, 10), paid_at: null, status: 'pending', payment_method: null, notes: null }],
    automations: [{ id: randomUUID(), ...base, name: 'Retorno após criação', trigger_type: 'deal_created', is_active: false, task_title: 'Retornar ao contato', due_days: 2, created_by: IDS.owner }],
    automation_logs: [], audit_logs: [], integration_configs: ['csv', 'calendar'].map(provider => ({ id: randomUUID(), org_id: IDS.org, provider, enabled: true, last_checked_at: now, created_at: old, updated_at: old })), email_templates: [{ id: randomUUID(), ...base, name: 'Modelo de exemplo', subject: 'Assunto de teste', body: 'Texto de teste.' }], invitations: [],
  } };
}
function filters(row: FixtureRow, params: URLSearchParams) {
  for (const [key, expression] of params) {
    if (['select', 'order', 'limit', 'offset', 'on_conflict'].includes(key)) continue;
    const value = row[key];
    if (expression.startsWith('eq.') && String(value) !== expression.slice(3)) return false;
    if (expression === 'is.null' && value != null) return false;
    if (expression === 'not.is.null' && value == null) return false;
    if (expression.startsWith('neq.') && String(value) === expression.slice(4)) return false;
    if (expression.startsWith('in.(') && !expression.slice(4, -1).split(',').map(v => v.replace(/^"|"$/g, '')).includes(String(value))) return false;
    if (expression.startsWith('gte.') && String(value) < expression.slice(4)) return false;
    if (expression.startsWith('lte.') && String(value) > expression.slice(4)) return false;
  }
  return true;
}
export async function installCrmFixture(page: Page, options: { role?: 'owner' | 'viewer' | 'member'; theme?: 'light' | 'dark'; state?: FixtureState } = {}) {
  const state = options.state ?? createFixture(options.role); const role = options.role ?? 'owner';
  const user = { id: state.userId, aud: 'authenticated', role: 'authenticated', email: role !== 'viewer' ? 'owner@example.test' : 'viewer@example.test', email_confirmed_at: new Date().toISOString(), app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, created_at: dayAt(-30), identities: [] };
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url'); const exp = Math.floor(Date.now() / 1000) + 86400;
  const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: state.userId, role: 'authenticated', aud: 'authenticated', exp })}.test-signature`;
  const session = { access_token: token, refresh_token: 'test-refresh-token', expires_in: 86400, expires_at: exp, token_type: 'bearer', user };
  await page.addInitScript(({ session, theme }) => { localStorage.setItem('empreende-crm-auth', JSON.stringify(session)); localStorage.setItem('empreende-ia-theme', theme); }, { session, theme: options.theme ?? 'dark' });
  async function respond(route: Route, body: unknown, status = 200, total?: number) {
    await route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS,HEAD', ...(total !== undefined ? { 'content-range': total ? `0-${total - 1}/${total}` : '*/0' } : {}) }, body: route.request().method() === 'HEAD' ? '' : JSON.stringify(body) });
  }
  await page.route('http://127.0.0.1:54329/**', async route => {
    const request = route.request(), url = new URL(request.url()), method = request.method();
    if (method === 'OPTIONS') return respond(route, {});
    if (url.pathname.startsWith('/auth/v1/')) return respond(route, url.pathname.endsWith('/user') ? user : session);
    const table = url.pathname.split('/').at(-1)!; let body: unknown = null; try { body = request.postDataJSON(); } catch { /* GET has no JSON */ }
    state.requests.push({ method, table, params: url.search, body });
    if (state.failReads.has(table) && ['GET', 'HEAD'].includes(method) || state.failWrites.has(table) && !['GET', 'HEAD'].includes(method)) return respond(route, { code: 'PGRST000', message: 'Falha intencional de teste' }, 503);
    if (url.pathname.includes('/rpc/')) {
      const args = body as Record<string, string>;
      if (table === 'search_crm') { const q = args.p_query.toLocaleLowerCase(); const results = [
        ...state.tables.contacts.filter(c => c.org_id === IDS.org).map(c => ({ entity: 'contact', id: c.id, title: `${c.first_name} ${c.last_name ?? ''}`.trim(), subtitle: c.email ?? 'Contato', path: `/contacts?contact=${c.id}` })),
        ...state.tables.deals.filter(d => d.org_id === IDS.org).map(d => ({ entity: 'deal', id: d.id, title: d.title, subtitle: 'Oportunidade', path: `/pipeline?deal=${d.id}` })),
      ].filter(item => String(item.title).toLocaleLowerCase().includes(q)); return respond(route, results); }
      if (table === 'move_deal') { const deal = state.tables.deals.find(d => d.id === args.p_deal_id)!; const previous = { ...deal }; Object.assign(deal, { stage_id: args.p_stage_id, status: args.p_status ?? deal.status, lost_reason: args.p_lost_reason ?? null, updated_at: new Date().toISOString(), stage_entered_at: new Date().toISOString() }); state.tables.deal_stage_history.push({ id: randomUUID(), org_id: IDS.org, deal_id: deal.id, from_stage_id: previous.stage_id, to_stage_id: deal.stage_id, from_status: previous.status, to_status: deal.status, changed_by: state.userId, created_at: new Date().toISOString() }); return respond(route, deal); }
      return respond(route, { code: 'PGRST202', message: 'RPC não implementada pela fixture: ' + table }, 404);
    }
    const tableRows = state.tables[table] ?? [];
    let selected = tableRows.filter(row => filters(row, url.searchParams));
    if (method === 'GET' || method === 'HEAD') {
      const order = url.searchParams.get('order'); if (order) selected.sort((a, b) => { for (const item of order.split(',')) { const [field, direction] = item.split('.'); const result = typeof a[field] === 'number' ? Number(a[field]) - Number(b[field]) : String(a[field] ?? '').localeCompare(String(b[field] ?? '')); if (result) return direction === 'desc' ? -result : result; } return 0; });
      const total = selected.length, offset = Number(url.searchParams.get('offset') ?? 0), limit = Number(url.searchParams.get('limit') ?? 1000); selected = selected.slice(offset, offset + limit);
      const single = request.headers().accept?.includes('application/vnd.pgrst.object+json');
      if (single && selected.length !== 1) return respond(route, { code: 'PGRST116', message: 'Expected exactly one row', details: `The result contains ${selected.length} rows`, hint: null }, 406);
      return respond(route, single ? selected[0] : selected, 200, total);
    }
    if (role === 'viewer') return respond(route, { code: '42501', message: 'Somente leitura no teste' }, 403);
    if (role === 'member' && method === 'DELETE') return respond(route, { code: '42501', message: 'Exclusão exige administrador' }, 403);
    const single = request.headers().accept?.includes('application/vnd.pgrst.object+json');
    if (single && ['PATCH', 'DELETE'].includes(method) && selected.length !== 1) return respond(route, { code: 'PGRST116', message: 'Expected exactly one row', details: `The result contains ${selected.length} rows`, hint: null }, 406);
    if (method === 'POST') {
      const incoming = Array.isArray(body) ? body : [body]; const created = incoming.map((fields: Record<string, unknown>) => ({ id: randomUUID(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...(table === 'contacts' ? { first_name: null, last_name: null, email: null, phone: null, company_id: null, owner_id: null, status: 'lead' } : {}), ...(table === 'activities' ? { body: null, type: 'task', user_id: null, contact_id: null, company_id: null, deal_id: null, due_date: null, end_date: null, completed_at: null, created_by: state.userId } : {}), ...(table === 'deals' ? { stage_entered_at: new Date().toISOString(), status: 'open', value: 0, probability: 0, currency: 'BRL' } : {}), ...fields })) as FixtureRow[];
      const conflictKeys = (url.searchParams.get('on_conflict') ?? 'id').split(',');
      const ignore = request.headers().prefer?.includes('resolution=ignore-duplicates');
      const merge = request.headers().prefer?.includes('resolution=merge-duplicates');
      const nextRows = tableRows.map(row => ({ ...row })); selected = [];
      for (const row of created) {
        const existing = nextRows.find(item => conflictKeys.every(key => item[key] === row[key]));
        if (existing && ignore) continue;
        if (existing && merge) { Object.assign(existing, row, { id: existing.id }); selected.push(existing); continue; }
        if (existing || table === 'contacts' && row.email && nextRows.some(item => item.org_id === row.org_id && String(item.email ?? '').trim().toLowerCase() === String(row.email).trim().toLowerCase())) return respond(route, { code: '23505', message: 'Duplicate identity' }, 409);
        nextRows.push(row); selected.push(row);
      }
      state.tables[table] = nextRows;
      if (table === 'deals') for (const d of created) state.tables.deal_stage_history.push({ id: randomUUID(), org_id: IDS.org, deal_id: d.id, from_stage_id: null, to_stage_id: d.stage_id, from_status: null, to_status: d.status, changed_by: state.userId, created_at: new Date().toISOString() });
    }
    if (method === 'PATCH') selected.forEach(row => Object.assign(row, body, { updated_at: new Date().toISOString() }));
    if (method === 'DELETE') state.tables[table] = tableRows.filter(row => !selected.includes(row));
    if (single && selected.length !== 1) return respond(route, { code: 'PGRST116', message: 'Expected exactly one row', details: `The result contains ${selected.length} rows`, hint: null }, 406);
    // The write is already committed to the fixture; only its acknowledgement is lost.
    if (state.loseNextWriteResponse.delete(table)) return route.abort('failed');
    return respond(route, single ? selected[0] : selected);
  });
  return state;
}
