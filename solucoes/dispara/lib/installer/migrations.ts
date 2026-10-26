/**
 * Executor de migrations para o installer.
 * COPIADO DO CRM QUE FUNCIONA - adaptado para múltiplos arquivos.
 */

import fs from 'fs';
import path from 'path';
import dns from 'dns';
import { Client } from 'pg';

const MIGRATIONS_DIR = path.resolve(process.cwd(), 'supabase/migrations');

function needsSsl(connectionString: string) {
  return !/sslmode=disable/i.test(connectionString);
}

function stripSslModeParam(connectionString: string) {
  // Some drivers/envs treat `sslmode=require` inconsistently. We control SSL via `Client({ ssl })`.
  try {
    const url = new URL(connectionString);
    url.searchParams.delete('sslmode');
    return url.toString();
  } catch {
    return connectionString;
  }
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

function isRetryableConnectError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();
  return (
    lower.includes('tenant or user not found') ||
    lower.includes('enotfound') ||
    lower.includes('eai_again') ||
    lower.includes('econnrefused') ||
    lower.includes('etimedout') ||
    lower.includes('timeout')
  );
}

/**
 * Aguarda storage.buckets existir (igual CRM).
 * O Supabase demora alguns segundos para habilitar storage após criar o projeto.
 */
async function waitForStorageReady(client: Client, opts?: { timeoutMs?: number; pollMs?: number }) {
  const timeoutMs = typeof opts?.timeoutMs === 'number' ? opts.timeoutMs : 210_000;
  const pollMs = typeof opts?.pollMs === 'number' ? opts?.pollMs : 4_000;
  const t0 = Date.now();

  while (Date.now() - t0 < timeoutMs) {
    try {
      const r = await client.query<{ ready: boolean }>(
        `select (to_regclass('storage.buckets') is not null) as ready`
      );
      const ready = Boolean(r?.rows?.[0]?.ready);
      if (ready) return;
    } catch {
      // keep polling on transient errors
    }
    await sleep(pollMs);
  }

  throw new Error(
    'Supabase Storage ainda não está pronto (storage.buckets não existe). Aguarde o projeto terminar de provisionar e tente novamente.'
  );
}

function shouldWaitForStorage(): boolean {
  return process.env.DISPARA_WAIT_STORAGE === 'true';
}

/**
 * Conecta com retry/backoff, recriando o Client a cada tentativa.
 * Isso evita o erro: "Client has already been connected. You cannot reuse a client."
 */
async function connectClientWithRetry(
  createClient: () => Client,
  opts?: { maxAttempts?: number; initialDelayMs?: number }
): Promise<Client> {
  const maxAttempts = opts?.maxAttempts ?? 5;
  const initialDelayMs = opts?.initialDelayMs ?? 3000;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const client = createClient();
    try {
      await client.connect();
      return client;
    } catch (err) {
      lastError = err;
      try {
        await client.end().catch(() => undefined);
      } catch {
        // ignore
      }

      if (!isRetryableConnectError(err) || attempt === maxAttempts) {
        throw err;
      }

      const delayMs = initialDelayMs * Math.pow(2, attempt - 1);
      const msg = err instanceof Error ? err.message : String(err);
      console.log(
        `[migrations] Conexão falhou (${msg}), tentativa ${attempt}/${maxAttempts}. Aguardando ${Math.round(
          delayMs / 1000
        )}s...`
      );
      await sleep(delayMs);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError ?? 'Falha ao conectar ao banco de dados'));
}

/**
 * Lista arquivos de migration em ordem.
 */
function listMigrationFiles(): string[] {
  try {
    const files = fs.readdirSync(MIGRATIONS_DIR);
    return files
      .filter((f) => f.endsWith('.sql') && !f.startsWith('.'))
      .sort();
  } catch {
    return [];
  }
}

/**
 * Função pública `runSchemaMigration` do projeto.
 * Igual ao CRM - sem callbacks, sem tracking table.
 */
export async function runSchemaMigration(dbUrl: string) {
  console.log('[migrations] Iniciando runSchemaMigration...');
  console.log('[migrations] MIGRATIONS_DIR:', MIGRATIONS_DIR);

  const migrationFiles = listMigrationFiles();
  console.log('[migrations] Arquivos encontrados:', migrationFiles.length, migrationFiles);

  if (migrationFiles.length === 0) {
    throw new Error('Nenhum arquivo de migration encontrado em supabase/migrations/');
  }

  const normalizedDbUrl = stripSslModeParam(dbUrl);

  // Log URL mascarada para debug
  try {
    const urlObj = new URL(normalizedDbUrl);
    console.log('[migrations] Host:', urlObj.hostname);
    console.log('[migrations] Port:', urlObj.port);
    console.log('[migrations] Database:', urlObj.pathname);
    console.log('[migrations] User:', urlObj.username);
  } catch {
    console.log('[migrations] URL não parseável');
  }
  console.log('[migrations] Conectando ao banco...');

  const createClient = () =>
    new Client({
      connectionString: normalizedDbUrl,
      // NOTE: Supabase DB uses TLS; on some networks a MITM/corporate proxy can inject a cert chain
      // that Node doesn't trust. For the installer/migrations step we prefer "no-verify" over failure.
      ssl: needsSsl(dbUrl) ? { rejectUnauthorized: false } : undefined,
    });

  const client = await connectClientWithRetry(createClient, { maxAttempts: 5, initialDelayMs: 3000 });
  console.log('[migrations] Conexão estabelecida com sucesso!');

  try {
    if (shouldWaitForStorage()) {
      // Aguarda storage.buckets existir (igual ao CRM)
      // O Supabase demora alguns segundos para habilitar storage após criar o projeto
      console.log('[migrations] Aguardando storage ficar pronto...');
      await waitForStorageReady(client);
      console.log('[migrations] Storage pronto, iniciando migrations...');
    } else {
      console.log('[migrations] Storage não é necessário, iniciando migrations...');
    }

    // Executa todos os arquivos de migration em ordem.
    for (const file of migrationFiles) {
      console.log(`[migrations] Aplicando ${file}...`);
      const filePath = path.join(MIGRATIONS_DIR, file);
      const sql = fs.readFileSync(filePath, 'utf8');

      try {
        await client.query(sql);
        console.log(`[migrations] ${file} aplicada com sucesso`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // Se o objeto já existe, não é erro - migration já foi aplicada
        if (msg.includes('already exists')) {
          console.log(`[migrations] ${file} já aplicada (objeto já existe)`);
          continue;
        }
        throw err;
      }
    }

    console.log('[migrations] Todas as migrations aplicadas com sucesso!');
  } finally {
    await client.end();
  }
}

/**
 * Fase G (migração QStash→pg_cron): configura o relógio no Supabase pós-migrations.
 *
 * Grava no Vault do Supabase os secrets que a função public.dispara_cron_tick() lê a cada
 * minuto (app_base_url + cron_secret) e garante o agendamento cron.schedule (caso a migration
 * o tenha adiado por a extensão pg_cron ainda não estar visível na mesma transação).
 *
 * Idempotente: usa vault.update_secret quando o secret já existe, senão vault.create_secret.
 * Best-effort no chamador — se o Vault não estiver disponível, a app ainda dispara campanhas
 * via auto-reinvocação; apenas os jobs agendados/reconcile ficam sem relógio até configurar.
 */
export async function configureCronVault(
  dbUrl: string,
  opts: { appBaseUrl: string; cronSecret: string }
): Promise<void> {
  const normalizedDbUrl = stripSslModeParam(dbUrl);

  const client = new Client({
    connectionString: normalizedDbUrl,
    ssl: needsSsl(dbUrl) ? { rejectUnauthorized: false } : undefined,
  });

  await client.connect();
  try {
    // Upsert idempotente de um secret nomeado no Vault.
    const upsertSecret = async (name: string, value: string) => {
      const existing = await client.query<{ id: string }>(
        'select id from vault.secrets where name = $1 limit 1',
        [name]
      );
      if (existing.rows.length > 0) {
        await client.query('select vault.update_secret($1, $2, $3)', [existing.rows[0].id, value, name]);
      } else {
        await client.query('select vault.create_secret($1, $2)', [value, name]);
      }
    };

    await upsertSecret('app_base_url', opts.appBaseUrl.replace(/\/$/, ''));
    await upsertSecret('cron_secret', opts.cronSecret);

    // Garante o agendamento (cron.schedule faz upsert pelo nome do job — idempotente).
    try {
      await client.query(
        `select cron.schedule('dispara-cron-tick', '* * * * *', 'select public.dispara_cron_tick();')`
      );
    } catch (e) {
      console.warn('[cron-vault] cron.schedule adiado (pg_cron ainda não pronto?):', e instanceof Error ? e.message : e);
    }
  } finally {
    await client.end().catch(() => {});
  }
}

/**
 * Verifica se o schema já foi aplicado (para health check).
 */
export async function checkSchemaApplied(dbUrl: string): Promise<boolean> {
  const normalizedDbUrl = stripSslModeParam(dbUrl);

  const client = new Client({
    connectionString: normalizedDbUrl,
    ssl: needsSsl(dbUrl) ? { rejectUnauthorized: false } : undefined,
  });

  try {
    await client.connect();

    const { rows } = await client.query<{ exists: boolean }>(
      `SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'settings'
      ) as exists`
    );

    return rows[0]?.exists || false;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => {});
  }
}
