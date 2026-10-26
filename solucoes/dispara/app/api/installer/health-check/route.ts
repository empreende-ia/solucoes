import { z } from 'zod';
import { Client } from 'pg';
import {
  extractProjectRefFromSupabaseUrl,
  resolveSupabaseDbUrl,
} from '@/lib/installer/supabase';

export const maxDuration = 60;
export const runtime = 'nodejs';

const HealthCheckSchema = z.object({
  supabase: z.object({
    url: z.string().url(),
    accessToken: z.string().min(1),
    projectRef: z.string().optional(),
    dbUrl: z.string().optional(),
  }),
});

interface HealthCheckResult {
  ok: boolean;
  projectStatus: 'ACTIVE_HEALTHY' | 'ACTIVE_UNHEALTHY' | 'COMING_UP' | 'PAUSED' | 'UNKNOWN';
  projectReady: boolean;
  storageReady: boolean;
  schemaApplied: boolean;
  hasSettings: boolean;
  skipWaitProject: boolean;
  skipWaitStorage: boolean;
  skipMigrations: boolean;
  skipBootstrap: boolean;
  estimatedSeconds: number;
  details?: Record<string, unknown>;
}

function needsSsl(connectionString: string) {
  return !/sslmode=disable/i.test(connectionString);
}

function stripSslModeParam(connectionString: string) {
  try {
    const url = new URL(connectionString);
    url.searchParams.delete('sslmode');
    return url.toString();
  } catch {
    return connectionString;
  }
}

async function checkDatabaseHealth(dbUrl: string): Promise<{
  storageReady: boolean;
  schemaApplied: boolean;
  hasSettings: boolean;
}> {
  const normalizedDbUrl = stripSslModeParam(dbUrl);
  const shouldWaitStorage = process.env.DISPARA_WAIT_STORAGE === 'true';

  // NÃO resolver para IPv4 - o SSL precisa do hostname original para SNI
  const client = new Client({
    connectionString: normalizedDbUrl,
    ssl: needsSsl(dbUrl) ? { rejectUnauthorized: false } : undefined,
  });

  try {
    await client.connect();

    // Dispara não depende de Storage por padrão. Só valida quando explicitamente solicitado.
    let storageReady = !shouldWaitStorage;
    if (shouldWaitStorage) {
      const storageResult = await client.query<{ ready: boolean }>(
        `SELECT (to_regclass('storage.buckets') IS NOT NULL) as ready`
      );
      storageReady = Boolean(storageResult?.rows?.[0]?.ready);
    }

    // Verifica se a tabela settings existe (indica schema aplicado)
    const schemaResult = await client.query<{ ready: boolean }>(
      `SELECT (to_regclass('public.settings') IS NOT NULL) as ready`
    );
    const schemaApplied = Boolean(schemaResult?.rows?.[0]?.ready);

    // Verifica se já tem configurações
    let hasSettings = false;
    if (schemaApplied) {
      const settingsResult = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text as count FROM public.settings LIMIT 1`
      );
      hasSettings = parseInt(settingsResult?.rows?.[0]?.count || '0', 10) > 0;
    }

    return { storageReady, schemaApplied, hasSettings };
  } catch (error) {
    console.error('[health-check] Database check failed:', error);
    return { storageReady: false, schemaApplied: false, hasSettings: false };
  } finally {
    await client.end().catch(() => {});
  }
}

async function getSupabaseProjectStatus(params: {
  accessToken: string;
  projectRef: string;
}): Promise<{ ok: true; status: string } | { ok: false; error: string }> {
  try {
    const res = await fetch(
      `https://api.supabase.com/v1/projects/${params.projectRef}`,
      {
        headers: {
          Authorization: `Bearer ${params.accessToken}`,
        },
      }
    );

    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` };
    }

    const data = await res.json();
    return { ok: true, status: data.status || 'UNKNOWN' };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function POST(req: Request) {
  // Verificar se installer está habilitado
  if (process.env.INSTALLER_ENABLED === 'false') {
    return Response.json({ error: 'Installer desabilitado' }, { status: 403 });
  }

  const raw = await req.json().catch(() => null);
  const parsed = HealthCheckSchema.safeParse(raw);

  if (!parsed.success) {
    return Response.json({ error: 'Payload inválido', details: parsed.error.flatten() }, { status: 400 });
  }

  const { supabase } = parsed.data;
  const projectRef = supabase.projectRef?.trim() || extractProjectRefFromSupabaseUrl(supabase.url) || '';

  if (!projectRef) {
    return Response.json({ error: 'Não foi possível identificar o projeto Supabase' }, { status: 400 });
  }

  const result: HealthCheckResult = {
    ok: false,
    projectStatus: 'UNKNOWN',
    projectReady: false,
    storageReady: false,
    schemaApplied: false,
    hasSettings: false,
    skipWaitProject: false,
    skipWaitStorage: false,
    skipMigrations: false,
    skipBootstrap: false,
    estimatedSeconds: 120,
  };

  try {
    // Verificar status do projeto Supabase
    const statusResult = await getSupabaseProjectStatus({
      accessToken: supabase.accessToken,
      projectRef,
    });

    if (statusResult.ok) {
      const status = (statusResult.status || '').toUpperCase();
      if (status.includes('ACTIVE_HEALTHY')) {
        result.projectStatus = 'ACTIVE_HEALTHY';
        result.projectReady = true;
      } else if (status.includes('ACTIVE')) {
        result.projectStatus = 'ACTIVE_UNHEALTHY';
        result.projectReady = true;
      } else if (status.includes('COMING_UP') || status.includes('RESTORING')) {
        result.projectStatus = 'COMING_UP';
        result.projectReady = false;
      } else if (status.includes('PAUSED') || status.includes('INACTIVE')) {
        result.projectStatus = 'PAUSED';
        result.projectReady = false;
      }
    }

    // Resolver DB URL se não fornecido
    let dbUrl = supabase.dbUrl?.trim() || '';
    if (!dbUrl && result.projectReady) {
      const dbResult = await resolveSupabaseDbUrl({
        projectRef,
        accessToken: supabase.accessToken,
      });
      if (dbResult.ok) {
        dbUrl = dbResult.dbUrl;
      }
    }

    // Verificar saúde do banco de dados
    if (dbUrl && result.projectReady) {
      const dbHealth = await checkDatabaseHealth(dbUrl);
      result.storageReady = dbHealth.storageReady;
      result.schemaApplied = dbHealth.schemaApplied;
      result.hasSettings = dbHealth.hasSettings;
    }

    // Determinar o que pode ser pulado
    result.skipWaitProject = result.projectReady;
    result.skipWaitStorage = result.storageReady;
    result.skipMigrations = result.schemaApplied;
    result.skipBootstrap = result.hasSettings;

    // Estimar tempo de instalação
    let estimatedSeconds = 10; // Base
    if (!result.skipWaitProject) estimatedSeconds += 90;
    if (!result.skipWaitStorage) estimatedSeconds += 30;
    if (!result.skipMigrations) estimatedSeconds += 15;
    if (!result.skipBootstrap) estimatedSeconds += 5;
    estimatedSeconds += 30; // Redeploy Vercel

    result.estimatedSeconds = estimatedSeconds;
    result.ok = true;
    result.details = {
      projectRef,
      dbUrlProvided: Boolean(supabase.dbUrl),
      dbUrlResolved: Boolean(dbUrl),
    };
  } catch (error) {
    console.error('[health-check] Error:', error);
    result.ok = false;
    result.details = { error: error instanceof Error ? error.message : 'Erro desconhecido' };
  }

  return Response.json(result);
}
