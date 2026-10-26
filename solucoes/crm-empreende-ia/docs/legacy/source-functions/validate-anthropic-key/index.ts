import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { api_key, org_id } = await req.json();
    if (!api_key || !org_id) {
      return new Response(JSON.stringify({ error: "Missing api_key or org_id" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Test with Anthropic API
    const testRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 10,
        messages: [{ role: "user", content: "Say OK" }],
      }),
    });

    if (!testRes.ok) {
      const errBody = await testRes.json().catch(() => ({}));
      const errType = errBody?.error?.type;
      if (errType === "authentication_error") {
        return new Response(JSON.stringify({ valid: false, error: "invalid_key" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (errType === "insufficient_quota" || errType === "billing_error" || testRes.status === 402) {
        return new Response(JSON.stringify({ valid: false, error: "no_credits" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ valid: false, error: "invalid_key" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Store securely using service role
    const adminClient = createClient(supabaseUrl, supabaseKey);

    // Store API key in org_secrets (write-only table)
    await adminClient.from("org_secrets").upsert(
      { org_id, key_name: "anthropic_api_key", key_value: api_key },
      { onConflict: "org_id,key_name" }
    );

    // Update integration_configs
    const { data: existing } = await adminClient.from("integration_configs").select("id").eq("org_id", org_id).eq("provider", "anthropic").maybeSingle();
    if (existing) {
      await adminClient.from("integration_configs").update({ config: { model: "claude-sonnet-4-20250514", configured: true }, is_active: true }).eq("id", existing.id);
    } else {
      await adminClient.from("integration_configs").insert({
        org_id, provider: "anthropic",
        config: { model: "claude-sonnet-4-20250514", configured: true },
        connected_by: user.id, is_active: true,
      });
    }

    return new Response(JSON.stringify({ valid: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("validate-anthropic-key error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
