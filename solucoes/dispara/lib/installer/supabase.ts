/**
 * Integração com Supabase Management API para o installer.
 * Gerencia projetos, chaves API e DB URLs.
 */

const SUPABASE_API_BASE = 'https://api.supabase.com';

/**
 * Mapeamento de regiões Vercel para regiões Supabase mais próximas.
 * Vercel: https://vercel.com/docs/edge-network/regions
 * Supabase: https://supabase.com/docs/guides/platform/regions
 */
const VERCEL_TO_SUPABASE_REGION: Record<string, string> = {
  // Americas
  'iad1': 'us-east-1',      // Washington D.C. -> N. Virginia
  'cle1': 'us-east-1',      // Cleveland -> N. Virginia
  'bos1': 'us-east-1',      // Boston -> N. Virginia
  'sfo1': 'us-west-1',      // San Francisco -> N. California
  'pdx1': 'us-west-2',      // Portland -> Oregon
  'gru1': 'sa-east-1',      // São Paulo -> São Paulo
  'cpt1': 'sa-east-1',      // Cape Town -> São Paulo (mais próximo)

  // Europe
  'lhr1': 'eu-west-2',      // London -> London
  'cdg1': 'eu-west-3',      // Paris -> Paris
  'fra1': 'eu-central-1',   // Frankfurt -> Frankfurt
  'arn1': 'eu-north-1',     // Stockholm -> Stockholm
  'dub1': 'eu-west-1',      // Dublin -> Ireland

  // Asia/Pacific
  'hnd1': 'ap-northeast-1', // Tokyo -> Tokyo
  'icn1': 'ap-northeast-2', // Seoul -> Seoul
  'sin1': 'ap-southeast-1', // Singapore -> Singapore
  'syd1': 'ap-southeast-2', // Sydney -> Sydney
  'bom1': 'ap-south-1',     // Mumbai -> Mumbai
  'hkg1': 'ap-southeast-1', // Hong Kong -> Singapore (mais próximo)
};

/**
 * Detecta a região Supabase ideal baseado na região Vercel.
 * Usa VERCEL_REGION env var ou fallback para us-east-1.
 */
export function detectSupabaseRegion(): string {
  const vercelRegion = process.env.VERCEL_REGION?.toLowerCase();

  if (vercelRegion && VERCEL_TO_SUPABASE_REGION[vercelRegion]) {
    return VERCEL_TO_SUPABASE_REGION[vercelRegion];
  }

  // Fallback: us-east-1 é a região mais estável e comum
  return 'us-east-1';
}

type SupabaseApiKeyItem = {
  api_key?: string;
  name?: string;
  type?: string;
};

function safeJsonParse(text: string): unknown | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return null;
  }
}

function buildManagementUrl(pathname: string): string {
  return `${SUPABASE_API_BASE}${pathname}`;
}

function extractErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const asAny = payload as Record<string, unknown>;
  const message = asAny.message;
  if (typeof message === 'string' && message.trim()) return message.trim();
  const error = asAny.error;
  if (typeof error === 'string' && error.trim()) return error.trim();
  return null;
}

async function supabaseManagementFetch(
  pathnameWithQuery: string,
  accessToken: string,
  init: RequestInit = {}
): Promise<{ ok: true; status: number; data: unknown } | { ok: false; status: number; error: string; data: unknown }> {
  const url = buildManagementUrl(pathnameWithQuery);
  const isFormData = typeof FormData !== 'undefined' && init.body instanceof FormData;

  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(isFormData ? {} : { 'content-type': 'application/json' }),
      ...(init.headers || {}),
    },
  });

  const text = await res.text();
  const parsed = safeJsonParse(text);

  if (!res.ok) {
    const parsedMessage = parsed ? extractErrorMessage(parsed) : null;
    const message = parsedMessage || (typeof text === 'string' && text.trim() ? text.trim() : `Supabase API error (${res.status})`);
    return { ok: false, status: res.status, error: message, data: parsed ?? text };
  }

  return { ok: true, status: res.status, data: parsed ?? (text || {}) };
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

/**
 * Obtém detalhes de um projeto Supabase.
 */
export async function getSupabaseProject(params: {
  accessToken: string;
  projectRef: string;
}): Promise<
  | {
      ok: true;
      project: { ref: string; name?: string; status?: string; region?: string; dbHost?: string };
      response: unknown;
    }
  | { ok: false; error: string; status?: number; response?: unknown }
> {
  const res = await supabaseManagementFetch(
    `/v1/projects/${encodeURIComponent(params.projectRef)}`,
    params.accessToken,
    { method: 'GET' }
  );
  if (!res.ok) return { ok: false, error: res.error, status: res.status, response: res.data };

  const data = res.data as Record<string, unknown>;
  const status =
    typeof data?.status === 'string'
      ? data.status
      : typeof data?.project_status === 'string'
        ? data.project_status
        : typeof data?.projectStatus === 'string'
          ? data.projectStatus
          : undefined;

  const dbHost =
    typeof (data?.database as Record<string, unknown>)?.host === 'string'
      ? (data.database as Record<string, unknown>).host as string
      : typeof data?.db_host === 'string'
        ? data.db_host
        : typeof data?.dbHost === 'string'
          ? data.dbHost
          : undefined;

  return {
    ok: true,
    project: {
      ref: params.projectRef,
      name: typeof data?.name === 'string' ? data.name : undefined,
      status: status as string | undefined,
      region: typeof data?.region === 'string' ? data.region : undefined,
      dbHost: (dbHost as string)?.trim() || undefined,
    },
    response: res.data,
  };
}

/**
 * Aguarda projeto Supabase ficar ACTIVE.
 */
export async function waitForSupabaseProjectReady(params: {
  accessToken: string;
  projectRef: string;
  timeoutMs?: number;
  pollMs?: number;
}): Promise<
  | { ok: true; status: string; response?: unknown }
  | { ok: false; error: string; lastStatus?: string; response?: unknown }
> {
  const timeoutMs = typeof params.timeoutMs === 'number' ? params.timeoutMs : 180_000;
  const pollMs = typeof params.pollMs === 'number' ? params.pollMs : 4_000;

  const t0 = Date.now();
  let lastStatus: string | undefined = undefined;
  let lastResponse: unknown | undefined = undefined;

  while (Date.now() - t0 < timeoutMs) {
    const res = await getSupabaseProject({ accessToken: params.accessToken, projectRef: params.projectRef });
    if (!res.ok) {
      // transient 404/5xx durante provisioning acontece; retry enquanto dentro do timeout
      lastResponse = res.response;
      await sleep(pollMs);
      continue;
    }

    lastResponse = res.response;
    lastStatus = res.project.status || '';
    const normalized = String(lastStatus || '').toUpperCase();
    if (normalized.startsWith('ACTIVE')) {
      return { ok: true, status: String(lastStatus || 'ACTIVE'), response: lastResponse };
    }

    await sleep(pollMs);
  }

  return {
    ok: false,
    error:
      `Projeto Supabase ainda está subindo (${lastStatus || 'status desconhecido'}). ` +
      'Aguarde um pouco e tente novamente.',
    lastStatus,
    response: lastResponse,
  };
}

/**
 * Lista organizações Supabase do usuário.
 */
export async function listSupabaseOrganizations(params: { accessToken: string }): Promise<
  | { ok: true; organizations: Array<{ slug: string; name: string; id?: string }>; response: unknown }
  | { ok: false; error: string; status?: number; response?: unknown }
> {
  const res = await supabaseManagementFetch('/v1/organizations', params.accessToken, { method: 'GET' });
  if (!res.ok) return { ok: false, error: res.error, status: res.status, response: res.data };

  const items = (Array.isArray(res.data) ? res.data : []) as Array<{ id?: string; slug?: string; name?: string }>;
  const organizations = items
    .map((o) => ({
      slug: typeof o.slug === 'string' ? o.slug : '',
      name: typeof o.name === 'string' ? o.name : '',
      id: typeof o.id === 'string' ? o.id : undefined,
    }))
    .filter((o) => o.slug && o.name);

  return { ok: true, organizations, response: res.data };
}

/**
 * Obtém detalhes de uma organização (incluindo plano).
 */
export async function getSupabaseOrganization(params: {
  accessToken: string;
  organizationSlug: string;
}): Promise<
  | { ok: true; organization: { slug: string; name: string; plan?: string }; response: unknown }
  | { ok: false; error: string; status?: number; response?: unknown }
> {
  const res = await supabaseManagementFetch(
    `/v1/organizations/${encodeURIComponent(params.organizationSlug)}`,
    params.accessToken,
    { method: 'GET' }
  );
  if (!res.ok) return { ok: false, error: res.error, status: res.status, response: res.data };

  const data = res.data as Record<string, unknown>;
  return {
    ok: true,
    organization: {
      slug: typeof data?.slug === 'string' ? data.slug : params.organizationSlug,
      name: typeof data?.name === 'string' ? data.name : '',
      plan: typeof data?.plan === 'string' ? data.plan : undefined,
    },
    response: res.data,
  };
}

/**
 * Lista todos os projetos de uma organização específica.
 */
export async function listOrganizationProjects(params: {
  accessToken: string;
  organizationSlug: string;
}): Promise<
  | { ok: true; projects: Array<{ ref: string; name: string; status?: string; region?: string }>; response: unknown }
  | { ok: false; error: string; status?: number; response?: unknown }
> {
  // A API de projetos retorna todos os projetos, filtramos por org
  const allProjects = await listSupabaseProjects({ accessToken: params.accessToken });
  if (!allProjects.ok) return allProjects;

  const orgProjects = allProjects.projects.filter(
    (p) => p.organizationSlug === params.organizationSlug
  );

  return { ok: true, projects: orgProjects, response: allProjects.response };
}

/**
 * Lista projetos de uma organização Supabase.
 */
export async function listSupabaseProjects(params: { accessToken: string }): Promise<
  | { ok: true; projects: Array<{ ref: string; name: string; region?: string; status?: string; organizationSlug?: string }>; response: unknown }
  | { ok: false; error: string; status?: number; response?: unknown }
> {
  const res = await supabaseManagementFetch('/v1/projects', params.accessToken, { method: 'GET' });
  if (!res.ok) return { ok: false, error: res.error, status: res.status, response: res.data };

  type ProjectItem = {
    ref?: string;
    name?: string;
    region?: string;
    status?: string;
    organization_slug?: string;
    organizationSlug?: string;
  };

  const items = (Array.isArray(res.data) ? res.data : []) as ProjectItem[];
  const projects = items
    .map((p) => ({
      ref: typeof p.ref === 'string' ? p.ref : '',
      name: typeof p.name === 'string' ? p.name : '',
      region: typeof p.region === 'string' ? p.region : undefined,
      status: typeof p.status === 'string' ? p.status : undefined,
      organizationSlug:
        typeof p.organization_slug === 'string'
          ? p.organization_slug
          : typeof p.organizationSlug === 'string'
            ? p.organizationSlug
            : undefined,
    }))
    .filter((p) => p.ref && p.name);

  return { ok: true, projects, response: res.data };
}

/**
 * Cria um novo projeto Supabase.
 *
 * @param region - Região explícita (ex: 'us-east-1'). Tem prioridade sobre regionSmartGroup.
 * @param regionSmartGroup - Seleção inteligente de região (deprecated, prefer region).
 */
export async function createSupabaseProject(params: {
  accessToken: string;
  organizationSlug: string;
  name: string;
  dbPass: string;
  region?: string;
  regionSmartGroup?: 'americas' | 'emea' | 'apac';
}): Promise<
  | { ok: true; projectRef: string; projectName: string; response: unknown }
  | { ok: false; error: string; status?: number; response?: unknown }
> {
  // Região explícita tem prioridade sobre smartGroup
  const body: Record<string, unknown> = {
    name: params.name,
    organization_slug: params.organizationSlug,
    db_pass: params.dbPass,
  };

  if (params.region) {
    // Usar região explícita (mais previsível, melhor para co-localização com Vercel)
    body.region = params.region;
  } else if (params.regionSmartGroup) {
    // Fallback para smart group (pode escolher região mais distante)
    body.region_selection = { type: 'smartGroup', code: params.regionSmartGroup };
  }

  const res = await supabaseManagementFetch('/v1/projects', params.accessToken, {
    method: 'POST',
    body: JSON.stringify(body),
  });

  if (!res.ok) return { ok: false, error: res.error, status: res.status, response: res.data };

  const data = res.data as Record<string, unknown>;
  const projectRef = data?.ref;
  const projectName = data?.name;
  if (typeof projectRef !== 'string' || !projectRef.trim() || typeof projectName !== 'string') {
    return { ok: false, error: 'Resposta inesperada ao criar projeto.', status: 500, response: res.data };
  }

  return { ok: true, projectRef: projectRef.trim(), projectName: projectName as string, response: res.data };
}

/**
 * Pausa um projeto Supabase (Free tier limit).
 */
export async function pauseSupabaseProject(params: {
  accessToken: string;
  projectRef: string;
}): Promise<
  | { ok: true; response: unknown }
  | { ok: false; error: string; status?: number; response?: unknown }
> {
  const res = await supabaseManagementFetch(
    `/v1/projects/${encodeURIComponent(params.projectRef)}/pause`,
    params.accessToken,
    { method: 'POST' }
  );
  if (!res.ok) return { ok: false, error: res.error, status: res.status, response: res.data };
  return { ok: true, response: res.data };
}

/**
 * Extrai projectRef de uma URL Supabase.
 */
export function extractProjectRefFromSupabaseUrl(supabaseUrl: string): string | null {
  try {
    const url = new URL(supabaseUrl);
    const host = url.hostname.toLowerCase();

    // Formato mais comum: https://<ref>.supabase.co
    const m1 = host.match(/^([a-z0-9-]+)\.supabase\.co$/i);
    if (m1?.[1]) return m1[1];

    // Às vezes: https://<ref>.supabase.in (regional)
    const m2 = host.match(/^([a-z0-9-]+)\.supabase\.in$/i);
    if (m2?.[1]) return m2[1];

    return null;
  } catch {
    return null;
  }
}

function pickApiKey(items: SupabaseApiKeyItem[], acceptedKinds: string[]): string | null {
  const accepted = acceptedKinds.map((k) => k.toLowerCase());

  const keyFromName = items.find((i) => {
    const name = typeof i.name === 'string' ? i.name.toLowerCase() : '';
    const okKind = accepted.some((k) => name.includes(k));
    return (
      okKind &&
      typeof i.api_key === 'string' &&
      i.api_key.trim()
    );
  })?.api_key;

  if (typeof keyFromName === 'string' && keyFromName.trim()) return keyFromName.trim();

  const keyFromType = items.find((i) => {
    const type = typeof i.type === 'string' ? i.type.toLowerCase() : '';
    const okKind = accepted.some((k) => type.includes(k));
    return (
      okKind &&
      typeof i.api_key === 'string' &&
      i.api_key.trim()
    );
  })?.api_key;

  if (typeof keyFromType === 'string' && keyFromType.trim()) return keyFromType.trim();

  return null;
}

/**
 * Resolve chaves API do Supabase (anon/publishable e service_role/secret).
 */
export async function resolveSupabaseApiKeys(params: {
  projectRef: string;
  accessToken: string;
}): Promise<
  | {
      ok: true;
      publishableKey: string;
      secretKey: string;
      publishableKeyType: 'publishable' | 'anon';
      secretKeyType: 'secret' | 'service_role';
      response: unknown;
    }
  | { ok: false; error: string; status?: number; response?: unknown }
> {
  const res = await supabaseManagementFetch(
    `/v1/projects/${encodeURIComponent(params.projectRef)}/api-keys?reveal=true`,
    params.accessToken,
    { method: 'GET' }
  );

  if (!res.ok) return { ok: false, error: res.error, status: res.status, response: res.data };

  const items = (Array.isArray(res.data) ? res.data : []) as SupabaseApiKeyItem[];
  const publishableKey = pickApiKey(items, ['publishable', 'anon']);
  const secretKey = pickApiKey(items, ['secret', 'service_role']);

  const publishableKeyType: 'publishable' | 'anon' =
    pickApiKey(items, ['publishable']) ? 'publishable' : 'anon';
  const secretKeyType: 'secret' | 'service_role' =
    pickApiKey(items, ['secret']) ? 'secret' : 'service_role';

  if (!publishableKey || !secretKey) {
    return {
      ok: false,
      error:
        'Não foi possível resolver chaves API do projeto. ' +
        'Verifique se o projeto está ativo e tente novamente.',
      status: 500,
      response: res.data,
    };
  }

  return {
    ok: true,
    publishableKey,
    secretKey,
    publishableKeyType,
    secretKeyType,
    response: res.data,
  };
}

/**
 * Resolve DB URL via CLI login role.
 * Usa o pooler do Supabase (porta 6543) para melhor compatibilidade.
 */
export async function resolveSupabaseDbUrl(params: {
  projectRef: string;
  accessToken: string;
}): Promise<
  | { ok: true; dbUrl: string; role: string; ttlSeconds: number; host: string; response: unknown }
  | { ok: false; error: string; status?: number; response?: unknown }
> {
  // Primeiro, obtém informações do projeto
  const project = await supabaseManagementFetch(
    `/v1/projects/${encodeURIComponent(params.projectRef)}`,
    params.accessToken,
    { method: 'GET' }
  );
  if (!project.ok) {
    return { ok: false, error: project.error, status: project.status, response: project.data };
  }

  const projectData = project.data as Record<string, unknown>;
  const host =
    (projectData?.database as Record<string, unknown>)?.host ||
    projectData?.db_host ||
    projectData?.dbHost;
  if (typeof host !== 'string' || !host.trim()) {
    return {
      ok: false,
      error: 'Não foi possível resolver o host do banco de dados.',
      status: 500,
      response: project.data,
    };
  }

  // Obtém credenciais temporárias via CLI login role
  const loginRole = await supabaseManagementFetch(
    `/v1/projects/${encodeURIComponent(params.projectRef)}/cli/login-role`,
    params.accessToken,
    { method: 'POST', body: JSON.stringify({ read_only: false }) }
  );
  if (!loginRole.ok) {
    const msg = String(loginRole.error || '');
    const lower = msg.toLowerCase();
    const looksLikeIpv4OnlyIssue =
      lower.includes('not ipv4') ||
      lower.includes('ipv6') ||
      lower.includes('econnrefused') ||
      lower.includes('address is not defined');

    return {
      ok: false,
      error: looksLikeIpv4OnlyIssue
        ? 'Conexão direta do banco parece ser IPv6-only. Use Connection Pooling.'
        : msg,
      status: loginRole.status,
      response: loginRole.data,
    };
  }

  const loginData = loginRole.data as Record<string, unknown>;
  const role = loginData?.role;
  const password = loginData?.password;
  const ttlSecondsRaw = loginData?.ttl_seconds;
  const ttlSeconds = typeof ttlSecondsRaw === 'number' ? ttlSecondsRaw : 0;
  if (typeof role !== 'string' || typeof password !== 'string' || !role.trim() || !password.trim()) {
    return {
      ok: false,
      error: 'Não foi possível resolver credenciais do banco de dados.',
      status: 500,
      response: loginRole.data,
    };
  }

  // Tenta resolver configuração do pooler
  let poolerHost: string | null = null;
  let poolerPort: number | null = null;
  let poolerDbName: string | null = null;

  const poolerConfig = await supabaseManagementFetch(
    `/v1/projects/${encodeURIComponent(params.projectRef)}/config/database/pooler`,
    params.accessToken,
    { method: 'GET' }
  );

  if (poolerConfig.ok && Array.isArray(poolerConfig.data) && poolerConfig.data.length > 0) {
    const configs = poolerConfig.data as Array<Record<string, unknown>>;
    const primary =
      configs.find(
        (c) =>
          String(c?.database_type || '').toUpperCase() === 'PRIMARY' &&
          String(c?.pool_mode || '').toLowerCase() === 'transaction'
      ) || configs[0];

    const h = primary?.db_host || primary?.dbHost;
    const pt = primary?.db_port || primary?.dbPort;
    const n = primary?.db_name || primary?.dbName;

    if (typeof h === 'string' && h.trim()) poolerHost = h.trim();
    if (typeof pt === 'number') poolerPort = pt;
    else if (typeof pt === 'string' && /^\d+$/.test(pt)) poolerPort = Number(pt);
    if (typeof n === 'string' && n.trim()) poolerDbName = n.trim();
  }

  // Fallback: usa o host do projeto se não conseguir resolver o pooler
  const finalHost = poolerHost || (host as string).trim();
  const finalPort = poolerPort || 6543;
  const finalDbName = poolerDbName || 'postgres';

  // Supavisor exige o projectRef no username: role.projectRef
  const poolerUser = `${role}.${params.projectRef}`;
  const dbUrl = `postgresql://${encodeURIComponent(poolerUser)}:${encodeURIComponent(
    password as string
  )}@${finalHost}:${finalPort}/${finalDbName}?sslmode=require&pgbouncer=true`;

  return {
    ok: true,
    dbUrl,
    role: role as string,
    ttlSeconds,
    host: finalHost,
    response: { project: project.data, pooler: poolerConfig.data, loginRole: loginRole.data },
  };
}
