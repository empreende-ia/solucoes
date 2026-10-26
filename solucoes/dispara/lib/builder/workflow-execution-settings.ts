import { settingsDb } from "@/lib/supabase-db";
import { isSupabaseConfigured } from "@/lib/supabase";

export type WorkflowExecutionConfig = {
  retryCount: number;
  retryDelayMs: number;
  timeoutMs: number;
};

const CONFIG_KEY = "workflow_execution_config";
const CACHE_TTL_MS = 30_000;

const DEFAULT_CONFIG: WorkflowExecutionConfig = {
  retryCount: 0,
  retryDelayMs: 500,
  timeoutMs: 10000,
};

let cached:
  | { config: WorkflowExecutionConfig; source: "db" | "env"; expiresAt: number }
  | null = null;

function clampInt(value: unknown, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return min;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

function configFromEnv(): WorkflowExecutionConfig {
  return {
    retryCount: clampInt(process.env.WORKFLOW_EXECUTION_RETRY_COUNT ?? "0", 0, 10),
    retryDelayMs: clampInt(
      process.env.WORKFLOW_EXECUTION_RETRY_DELAY_MS ?? "500",
      0,
      60_000
    ),
    timeoutMs: clampInt(
      process.env.WORKFLOW_EXECUTION_TIMEOUT_MS ?? "10000",
      0,
      60_000
    ),
  };
}

export async function getWorkflowExecutionConfig(): Promise<{
  config: WorkflowExecutionConfig;
  source: "db" | "env";
}> {
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return { config: cached.config, source: cached.source };
  }

  const envConfig = configFromEnv();
  let raw: string | null = null;
  if (isSupabaseConfigured()) {
    try {
      raw = await settingsDb.get(CONFIG_KEY);
    } catch {
      raw = null;
    }
  }

  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Partial<WorkflowExecutionConfig>;
      const config: WorkflowExecutionConfig = {
        retryCount:
          parsed.retryCount !== undefined
            ? clampInt(parsed.retryCount, 0, 10)
            : envConfig.retryCount,
        retryDelayMs:
          parsed.retryDelayMs !== undefined
            ? clampInt(parsed.retryDelayMs, 0, 60_000)
            : envConfig.retryDelayMs,
        timeoutMs:
          parsed.timeoutMs !== undefined
            ? clampInt(parsed.timeoutMs, 0, 60_000)
            : envConfig.timeoutMs,
      };
      cached = { config, source: "db", expiresAt: now + CACHE_TTL_MS };
      return { config, source: "db" };
    } catch {
      // fall through to env defaults
    }
  }

  cached = { config: envConfig, source: "env", expiresAt: now + CACHE_TTL_MS };
  return { config: envConfig, source: "env" };
}

export function clearWorkflowExecutionConfigCache(): void {
  cached = null;
}
