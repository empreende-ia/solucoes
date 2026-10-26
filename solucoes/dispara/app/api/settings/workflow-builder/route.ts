import { NextResponse } from "next/server";
import { settingsDb } from "@/lib/supabase-db";

const SETTINGS_KEY = "workflow_builder_default_id";

export async function GET() {
  const value = await settingsDb.get(SETTINGS_KEY);
  return NextResponse.json({ defaultWorkflowId: value || "" });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const defaultWorkflowId = String(body?.defaultWorkflowId || "").trim();
  await settingsDb.set(SETTINGS_KEY, defaultWorkflowId);
  return NextResponse.json({ defaultWorkflowId });
}
