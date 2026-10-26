import { NextResponse } from "next/server";
import { settingsDb } from "@/lib/supabase-db";
import { isSupabaseConfigured } from "@/lib/supabase";
import {
  clearWorkflowExecutionConfigCache,
  getWorkflowExecutionConfig,
} from "@/lib/builder/workflow-execution-settings";
import { clampInt } from "@/lib/validation-utils";

const CONFIG_KEY = "workflow_execution_config";

type WorkflowExecutionConfig = {
  retryCount: number;
  retryDelayMs: number;
  timeoutMs: number;
};

function fallbackConfig(): WorkflowExecutionConfig {
  return { retryCount: 0, retryDelayMs: 500, timeoutMs: 10000 };
}

export async function GET() {
  try {
    const { config, source } = await getWorkflowExecutionConfig();
    return NextResponse.json({ ok: true, source, config });
  } catch (error) {
    console.error("Error fetching workflow execution config:", error);
    return NextResponse.json({
      ok: true,
      source: "env",
      config: fallbackConfig(),
      warning: "Failed to load config; using defaults.",
    });
  }
}

export async function POST(request: Request) {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json(
        {
          ok: false,
          error: "Supabase nao configurado. Complete o setup antes de salvar.",
        },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const current = await getWorkflowExecutionConfig();

    const next: WorkflowExecutionConfig = {
      retryCount:
        body.retryCount !== undefined
          ? clampInt(body.retryCount, 0, 10)
          : current.config.retryCount,
      retryDelayMs:
        body.retryDelayMs !== undefined
          ? clampInt(body.retryDelayMs, 0, 60_000)
          : current.config.retryDelayMs,
      timeoutMs:
        body.timeoutMs !== undefined
          ? clampInt(body.timeoutMs, 0, 60_000)
          : current.config.timeoutMs,
    };

    await settingsDb.set(CONFIG_KEY, JSON.stringify(next));
    clearWorkflowExecutionConfigCache();

    return NextResponse.json({ ok: true, config: next });
  } catch (error) {
    console.error("Error saving workflow execution config:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to save config" },
      { status: 502 }
    );
  }
}
