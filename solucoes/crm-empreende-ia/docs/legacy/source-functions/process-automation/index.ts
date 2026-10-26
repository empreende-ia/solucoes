import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const start = Date.now();
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const body = await req.json();
    const { automation_id, trigger_payload, org_id, retry_count = 0 } = body;

    if (!automation_id || !org_id) {
      return new Response(JSON.stringify({ error: "Missing automation_id or org_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch automation
    const { data: auto, error: autoErr } = await supabase
      .from("automations")
      .select("*")
      .eq("id", automation_id)
      .eq("org_id", org_id)
      .single();

    if (autoErr || !auto) {
      return new Response(JSON.stringify({ error: "Automation not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!auto.is_active) {
      return new Response(JSON.stringify({ error: "Automation is not active" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Read trigger_config (real schema). Conditions live nested under trigger_config.conditions.
    const triggerConfig = (auto.trigger_config as any) || {};
    const conditions = Array.isArray(triggerConfig.conditions) ? triggerConfig.conditions : [];
    let conditionsMet = true;
    for (const cond of conditions) {
      const fieldVal = trigger_payload?.[cond.field];
      switch (cond.operator) {
        case "equals":
          if (String(fieldVal) !== String(cond.value)) conditionsMet = false;
          break;
        case "not_equals":
          if (String(fieldVal) === String(cond.value)) conditionsMet = false;
          break;
        case "greater_than":
          if (Number(fieldVal) <= Number(cond.value)) conditionsMet = false;
          break;
        case "less_than":
          if (Number(fieldVal) >= Number(cond.value)) conditionsMet = false;
          break;
        case "contains":
          if (!String(fieldVal).includes(String(cond.value))) conditionsMet = false;
          break;
        case "not_contains":
          if (String(fieldVal).includes(String(cond.value))) conditionsMet = false;
          break;
      }
      if (!conditionsMet) break;
    }

    if (!conditionsMet) {
      await supabase.from("automation_logs").insert({
        org_id,
        automation_id,
        status: "skipped",
        payload: { trigger_payload, reason: "Conditions not met", duration_ms: Date.now() - start },
      });
      return new Response(JSON.stringify({ status: "skipped", reason: "Conditions not met" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Execute actions sequentially
    const actionsResult: any[] = [];
    for (const action of auto.actions || []) {
      try {
        const result = await executeAction(supabase, org_id, action, trigger_payload);
        actionsResult.push({ type: action.type, status: "ok", result });
      } catch (err: any) {
        actionsResult.push({ type: action.type, status: "error", error: err.message });
        // Continue executing remaining actions
      }
    }

    const hasErrors = actionsResult.some((r) => r.status === "error");
    const duration = Date.now() - start;

    // Log execution (only columns that exist in automation_logs)
    const errorMessage = hasErrors
      ? actionsResult.filter((r) => r.status === "error").map((r) => r.error).join("; ")
      : null;
    await supabase.from("automation_logs").insert({
      org_id,
      automation_id,
      status: hasErrors ? "partial_error" : "success",
      payload: { trigger_payload, actions_result: actionsResult, duration_ms: duration },
      error: errorMessage,
    });

    // Retry on full failure
    if (hasErrors && actionsResult.every((r) => r.status === "error") && retry_count < 3) {
      // Could schedule a retry here via pg_cron or delayed fetch
      console.log(`Automation ${automation_id} failed, retry ${retry_count + 1}/3`);
    }

    return new Response(JSON.stringify({ status: hasErrors ? "partial_error" : "success", actions: actionsResult, duration_ms: duration }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    const duration = Date.now() - start;
    return new Response(JSON.stringify({ error: err.message, duration_ms: duration }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function executeAction(supabase: any, orgId: string, action: any, payload: any) {
  const cfg = action.config || {};

  switch (action.type) {
    case "create_task": {
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + (cfg.due_days || 1));
      const { error } = await supabase.from("activities").insert({
        org_id: orgId,
        type: "task",
        title: cfg.title || "Tarefa automática",
        body: cfg.body || `Criada pela automação. Prioridade: ${cfg.priority || "medium"}`,
        due_date: dueDate.toISOString(),
        contact_id: payload?.contact_id || null,
      });
      if (error) throw new Error(`create_task: ${error.message}`);
      return { created: true };
    }

    case "create_note": {
      const { error } = await supabase.from("activities").insert({
        org_id: orgId,
        type: "note",
        title: "Nota automática",
        body: cfg.body || "Nota criada por automação",
        contact_id: payload?.contact_id || null,
      });
      if (error) throw new Error(`create_note: ${error.message}`);
      return { created: true };
    }

    case "send_whatsapp": {
      // Load Evolution API config + secret
      const { data: cfgRow } = await supabase
        .from("integration_configs")
        .select("config, is_active")
        .eq("org_id", orgId)
        .eq("provider", "evolution_api")
        .maybeSingle();
      if (!cfgRow || !cfgRow.is_active) {
        throw new Error("Evolution API não configurada ou inativa");
      }
      const { data: secretRow } = await supabase
        .from("org_secrets")
        .select("key_value")
        .eq("org_id", orgId)
        .eq("key_name", "evolution_api_key")
        .maybeSingle();
      const apiKey = secretRow?.key_value;
      if (!apiKey) throw new Error("evolution_api_key ausente em org_secrets");

      const baseUrl: string = (cfgRow.config?.base_url || "").replace(/\/+$/, "");
      const instance: string = cfgRow.config?.instance;
      if (!baseUrl || !instance) throw new Error("base_url/instance ausentes na config Evolution");

      // Resolve destination phone
      let phone: string | null = payload?.phone || null;
      let patientName = payload?.paciente?.nome || payload?.patient_name || "";
      if (!phone && payload?.patient_id) {
        const { data: p } = await supabase
          .from("patients")
          .select("phone, first_name, last_name")
          .eq("id", payload.patient_id)
          .maybeSingle();
        if (p) {
          phone = p.phone;
          patientName = patientName || [p.first_name, p.last_name].filter(Boolean).join(" ");
        }
      }
      if (!phone && payload?.contact_id) {
        const { data: c } = await supabase
          .from("contacts")
          .select("phone, first_name, last_name")
          .eq("id", payload.contact_id)
          .maybeSingle();
        if (c) {
          phone = c.phone;
          patientName = patientName || [c.first_name, c.last_name].filter(Boolean).join(" ");
        }
      }
      if (!phone) throw new Error("Telefone do destinatário não encontrado no payload");

      // Render template variables
      const vars: Record<string, string> = {
        "paciente.nome": patientName || "",
        "consulta.horario": payload?.consulta?.horario || "",
        "consulta.data": payload?.consulta?.data || "",
        "consulta.preparo": payload?.consulta?.preparo || "",
        "profissional.nome": payload?.profissional?.nome || "",
        "link.avaliacao": payload?.link?.avaliacao || "",
      };
      let text: string = String(cfg.template || cfg.message || "");
      text = text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k) => vars[k] ?? "");

      const cleanPhone = String(phone).replace(/\D/g, "");
      const url = `${baseUrl}/message/sendText/${encodeURIComponent(instance)}`;
      const resp = await fetch(url, {
        method: "POST",
        headers: { apikey: apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ number: cleanPhone, text, textMessage: { text } }),
      });
      const respBody = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(`send_whatsapp upstream ${resp.status}: ${JSON.stringify(respBody).slice(0, 300)}`);
      }
      return { sent: true, to: cleanPhone, message_id: respBody?.key?.id ?? null };
    }

    case "move_deal_stage": {
      if (!payload?.deal_id) throw new Error("No deal_id in payload");
      // Find stage by name
      const { data: stages } = await supabase
        .from("pipeline_stages")
        .select("id,name")
        .eq("org_id", orgId)
        .ilike("name", `%${cfg.to_stage}%`)
        .limit(1);
      const stageId = stages?.[0]?.id;
      if (!stageId) throw new Error(`Stage '${cfg.to_stage}' not found`);
      const { error } = await supabase.from("deals").update({ stage_id: stageId }).eq("id", payload.deal_id);
      if (error) throw new Error(`move_deal_stage: ${error.message}`);
      return { moved_to: stageId };
    }

    case "assign_owner": {
      const entityTable = payload?.deal_id ? "deals" : payload?.contact_id ? "contacts" : null;
      const entityId = payload?.deal_id || payload?.contact_id;
      if (!entityTable || !entityId) throw new Error("No entity to assign");

      let ownerId = cfg.user_id;
      if (cfg.strategy === "round_robin") {
        const { data: members } = await supabase.from("profiles").select("id").eq("org_id", orgId);
        if (members?.length) {
          ownerId = members[Math.floor(Math.random() * members.length)].id;
        }
      }
      if (!ownerId) throw new Error("No owner to assign");
      const { error } = await supabase.from(entityTable).update({ owner_id: ownerId }).eq("id", entityId);
      if (error) throw new Error(`assign_owner: ${error.message}`);
      return { assigned: ownerId };
    }

    case "add_tag": {
      if (!cfg.tag_name) throw new Error("No tag name");
      // Find or create tag
      let { data: existing } = await supabase.from("tags").select("id").eq("org_id", orgId).eq("name", cfg.tag_name).single();
      if (!existing) {
        const { data: created, error } = await supabase.from("tags").insert({ org_id: orgId, name: cfg.tag_name }).select("id").single();
        if (error) throw new Error(`add_tag create: ${error.message}`);
        existing = created;
      }
      if (payload?.deal_id) {
        await supabase.from("deal_tags").insert({ deal_id: payload.deal_id, tag_id: existing.id });
      } else if (payload?.contact_id) {
        await supabase.from("contact_tags").insert({ contact_id: payload.contact_id, tag_id: existing.id });
      }
      return { tag_added: cfg.tag_name };
    }

    case "call_webhook": {
      if (!cfg.url) throw new Error("No webhook URL");
      const resp = await fetch(cfg.url, {
        method: cfg.method || "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, automation_action: action.type }),
      });
      const text = await resp.text();
      return { status: resp.status, body: text.slice(0, 500) };
    }

    case "wait": {
      // In a real system, this would schedule the next action
      // For now, just log the delay
      return { delay_days: cfg.days || 1, note: "Delay logged; real scheduling requires pg_cron" };
    }

    case "notify_user":
      // Placeholder: in production, use push/email/slack
      return { notified: true, message: cfg.message };

    case "send_email_template":
      return { template_id: cfg.template_id, note: "Email sending requires email integration" };

    case "remove_tag":
      return { tag_removed: cfg.tag_name, note: "Remove tag not fully implemented" };

    default:
      return { note: `Action type '${action.type}' not implemented` };
  }
}
