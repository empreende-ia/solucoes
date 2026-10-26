import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { fetchWorkflowRecord } from "@/lib/builder/workflow-db";
import { parseWorkflowSettings } from "@/lib/builder/workflow-settings";
import { TRIGGER_NODE_ID } from "@/lib/builder/flow/compile";
import { normalizePhoneNumber } from "@/lib/phone-formatter";

/**
 * Inscrição manual/bulk de contatos num workflow PUBLICADO — o "Add to
 * Workflow" do GHL. É o que torna útil um fluxo sem gatilho (triggerType None).
 *
 * Mecânica: insere workflow_enrollments status='waiting' com resume_at=now e
 * resume_node_ids = primeiros nós após o __trigger. O drain do pg_cron
 * (drainWorkflowEnrollments) retoma no próximo tick e ganha de graça claim
 * atômico, backoff, anti-poison e o UNIQUE parcial (workflow_id, phone) que
 * deduplica inscrições ativas. Throughput: ~25 contatos/min (limite do drain).
 */

type RouteParams = {
  params: Promise<{ workflowId: string }>;
};

type EnrollBody = {
  contactIds?: string[];
  phones?: string[];
};

export async function POST(request: Request, { params }: RouteParams) {
  const { workflowId } = await params;
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase not configured" },
      { status: 400 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as EnrollBody;
  const contactIds = Array.isArray(body.contactIds)
    ? body.contactIds.map(String).filter(Boolean)
    : [];
  const rawPhones = Array.isArray(body.phones)
    ? body.phones.map(String).filter(Boolean)
    : [];
  if (contactIds.length === 0 && rawPhones.length === 0) {
    return NextResponse.json(
      { error: "Informe contactIds ou phones" },
      { status: 400 }
    );
  }

  const record = await fetchWorkflowRecord(supabase, workflowId);
  if (!record) {
    return NextResponse.json(
      { error: "Workflow não encontrado" },
      { status: 404 }
    );
  }
  // Como no GHL, só workflows publicados aceitam inscrição em massa.
  if (record.workflow.status !== "published") {
    return NextResponse.json(
      { error: "Publique o workflow antes de adicionar contatos" },
      { status: 409 }
    );
  }

  // Primeiros nós após o gatilho na versão ativa (raízes da retomada).
  const heads = record.version.edges
    .filter((edge) => edge.source === TRIGGER_NODE_ID)
    .map((edge) => edge.target);
  if (heads.length === 0) {
    return NextResponse.json(
      { error: "O fluxo não tem passos após o gatilho" },
      { status: 409 }
    );
  }

  // Resolve os contatos: por id (com telefone) e/ou telefones avulsos.
  const targets = new Map<string, { contactId: string | null }>();
  if (contactIds.length > 0) {
    const { data: contacts } = await supabase
      .from("contacts")
      .select("id, phone")
      .in("id", contactIds);
    for (const c of contacts ?? []) {
      const phone = normalizePhoneNumber(String((c as { phone: string }).phone));
      if (phone) targets.set(phone, { contactId: (c as { id: string }).id });
    }
  }
  for (const raw of rawPhones) {
    const phone = normalizePhoneNumber(raw);
    if (phone && !targets.has(phone)) targets.set(phone, { contactId: null });
  }
  if (targets.size === 0) {
    return NextResponse.json(
      { error: "Nenhum telefone válido nos contatos informados" },
      { status: 400 }
    );
  }

  // Allow Re-entry desligado → quem JÁ participou (qualquer status de
  // enrollment) não entra de novo.
  const settings = parseWorkflowSettings(record.workflow.settings);
  let blocked = new Set<string>();
  if (settings.allowReentry === false) {
    const { data: prior } = await supabase
      .from("workflow_enrollments")
      .select("phone")
      .eq("workflow_id", workflowId)
      .in("phone", Array.from(targets.keys()));
    blocked = new Set((prior ?? []).map((r) => String((r as { phone: string }).phone)));
  }

  // Quem já está ATIVO no fluxo não é re-inscrito (o UNIQUE parcial rejeitaria
  // o lote inteiro num insert em batch — filtra antes).
  const { data: activeRows } = await supabase
    .from("workflow_enrollments")
    .select("phone")
    .eq("workflow_id", workflowId)
    .in("status", ["active", "waiting"])
    .in("phone", Array.from(targets.keys()));
  const alreadyActive = new Set(
    (activeRows ?? []).map((r) => String((r as { phone: string }).phone))
  );

  const nowIso = new Date().toISOString();
  const rows = Array.from(targets.entries())
    .filter(([phone]) => !blocked.has(phone) && !alreadyActive.has(phone))
    .map(([phone, { contactId }]) => ({
      workflow_id: workflowId,
      version_id: record.workflow.active_version_id,
      phone,
      contact_id: contactId,
      status: "waiting",
      wait_kind: "delay",
      current_node_id: heads[0] ?? null,
      resume_node_ids: heads,
      resume_at: nowIso,
      variables: {},
      resolved_nodes: [TRIGGER_NODE_ID],
      // Snapshot do output do gatilho: refs {{@__trigger:...}} a jusante
      // resolvem mesmo sem mensagem inbound (inscrição manual não tem uma).
      outputs: {
        [TRIGGER_NODE_ID]: {
          label: "Gatilho",
          data: {
            triggered: true,
            enrolledManually: true,
            from: phone,
            to: phone,
            message: "",
          },
        },
      },
      created_at: nowIso,
      updated_at: nowIso,
    }));

  let enrolled = 0;
  if (rows.length > 0) {
    const { data: inserted, error } = await supabase
      .from("workflow_enrollments")
      .insert(rows)
      .select("id");
    if (error) {
      // Corrida com o UNIQUE parcial (contato entrou no fluxo entre o filtro e
      // o insert): re-tenta linha a linha ignorando os conflitos.
      let ok = 0;
      for (const row of rows) {
        const { error: rowError } = await supabase
          .from("workflow_enrollments")
          .insert(row);
        if (!rowError) ok += 1;
      }
      enrolled = ok;
    } else {
      enrolled = (inserted ?? []).length;
    }
  }

  return NextResponse.json({
    success: true,
    requested: targets.size,
    enrolled,
    alreadyActive: alreadyActive.size,
    blockedByReentry: blocked.size,
  });
}
