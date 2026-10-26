import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/slack/api";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SLACK_API_KEY = Deno.env.get("SLACK_API_KEY");
    if (!SLACK_API_KEY) {
      return new Response(JSON.stringify({ error: "SLACK_API_KEY not configured", not_connected: true }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { org_id } = await req.json();

    const gatewayHeaders = {
      "Authorization": `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": SLACK_API_KEY,
      "Content-Type": "application/json",
    };

    // 1. Verify connection with auth.test
    const authRes = await fetch(`${GATEWAY_URL}/auth.test`, {
      method: "POST",
      headers: gatewayHeaders,
    });
    const authData = await authRes.json();

    if (!authData.ok) {
      return new Response(JSON.stringify({ error: "Slack connection failed", detail: authData.error }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. List public channels
    const channelsRes = await fetch(`${GATEWAY_URL}/conversations.list?types=public_channel&limit=200&exclude_archived=true`, {
      headers: gatewayHeaders,
    });
    const channelsData = await channelsRes.json();

    const channels = (channelsData.channels || []).map((ch: any) => ({
      id: ch.id,
      name: ch.name,
    }));

    // 3. Save to integration_configs
    if (org_id) {
      const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
      const supabaseAdmin = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );

      // Check if exists first, then insert or update
      const { data: existing } = await supabaseAdmin
        .from("integration_configs")
        .select("id")
        .eq("org_id", org_id)
        .eq("provider", "slack")
        .maybeSingle();

      const configData = {
        workspace_name: authData.team,
        bot_user_id: authData.user_id,
        connected_via: "lovable_connector",
      };

      if (existing) {
        await supabaseAdmin.from("integration_configs")
          .update({ config: configData, is_active: true })
          .eq("id", existing.id);
      } else {
        await supabaseAdmin.from("integration_configs")
          .insert({ org_id, provider: "slack", config: configData, is_active: true });
      }
    }

    return new Response(JSON.stringify({
      workspace_name: authData.team,
      bot_user_id: authData.user_id,
      channels,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("slack-connect error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
