import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type Body = {
  org_id?: string;
  base_url?: string;
  instance?: string;
  api_key?: string;
  from_phone?: string;
};

function json(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json(401, { error: "Unauthorized" });

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      return json(500, { error: "Server configuration error" });
    }

    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) return json(401, { error: "Unauthorized" });

    const body = (await req.json()) as Body;
    const { org_id, base_url, instance, api_key, from_phone } = body;
    if (!org_id || !base_url || !instance) {
      return json(400, { error: "Missing org_id, base_url or instance" });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: profile } = await admin
      .from("profiles")
      .select("org_id")
      .eq("id", user.id)
      .maybeSingle();
    if (!profile || profile.org_id !== org_id) return json(403, { error: "Forbidden" });

    // If api_key not provided, reuse stored one (edit flow)
    let effectiveKey = api_key?.trim() || "";
    if (!effectiveKey) {
      const { data: existing } = await admin
        .from("org_secrets")
        .select("key_value")
        .eq("org_id", org_id)
        .eq("key_name", "evolution_api_key")
        .maybeSingle();
      effectiveKey = existing?.key_value || "";
    }
    if (!effectiveKey) return json(400, { error: "missing_api_key" });

    const cleanBase = base_url.replace(/\/+$/, "");
    const url = `${cleanBase}/instance/connectionState/${encodeURIComponent(instance)}`;

    let upstreamStatus = 0;
    let upstreamBody: any = null;
    try {
      const resp = await fetch(url, { method: "GET", headers: { apikey: effectiveKey } });
      upstreamStatus = resp.status;
      upstreamBody = await resp.json().catch(() => ({}));
    } catch (e) {
      return json(200, { valid: false, error: "unreachable", detail: String(e) });
    }

    if (upstreamStatus === 401 || upstreamStatus === 403) {
      return json(200, { valid: false, error: "invalid_key", status: upstreamStatus });
    }
    if (upstreamStatus === 404) {
      return json(200, { valid: false, error: "instance_not_found", status: upstreamStatus });
    }
    if (upstreamStatus >= 400) {
      return json(200, { valid: false, error: "upstream_error", status: upstreamStatus, body: upstreamBody });
    }

    // Save secret + config
    const { error: secretErr } = await admin.from("org_secrets").upsert(
      { org_id, key_name: "evolution_api_key", key_value: effectiveKey },
      { onConflict: "org_id,key_name" },
    );
    if (secretErr) return json(500, { error: "secret_save_failed", detail: secretErr.message });

    const state = (upstreamBody?.instance?.state || upstreamBody?.state || "unknown") as string;

    const { error: configErr } = await admin.from("integration_configs").upsert(
      {
        org_id,
        provider: "evolution_api",
        config: {
          base_url: cleanBase,
          instance,
          from_phone: from_phone?.trim() || null,
          last_state: state,
          configured: true,
        },
        connected_by: user.id,
        is_active: true,
      },
      { onConflict: "org_id,provider" },
    );
    if (configErr) return json(500, { error: "config_save_failed", detail: configErr.message });

    return json(200, { valid: true, state });
  } catch (err) {
    console.error("validate-evolution-key error", err);
    return json(500, { error: "Internal error", detail: String(err) });
  }
});