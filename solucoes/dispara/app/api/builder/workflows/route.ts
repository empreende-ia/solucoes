import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  getCompanyId,
  listWorkflowRecords,
  toSavedWorkflow,
} from "@/lib/builder/workflow-db";

export async function GET() {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json([]);
  }

  const companyId = await getCompanyId(supabase);
  const records = await listWorkflowRecords(supabase, companyId);
  return NextResponse.json(records.map((record) => toSavedWorkflow(record)));
}
