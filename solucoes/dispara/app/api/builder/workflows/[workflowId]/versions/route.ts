import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

type RouteParams = {
  params: Promise<{ workflowId: string }>;
};

export async function GET(_request: Request, { params }: RouteParams) {
  const { workflowId } = await params;
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json([]);
  }

  const { data } = await supabase
    .from("workflow_versions")
    .select("*")
    .eq("workflow_id", workflowId)
    .order("version", { ascending: false });

  return NextResponse.json(data || []);
}
