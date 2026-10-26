import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const start = Date.now();
  const requestId = crypto.randomUUID();

  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const dbStart = Date.now();
    const { error } = await sb.from("organizations").select("id").limit(1);
    const dbLatency = Date.now() - dbStart;

    const status = error ? "degraded" : "healthy";
    const response = {
      status,
      request_id: requestId,
      timestamp: new Date().toISOString(),
      latency_ms: Date.now() - start,
      db_latency_ms: dbLatency,
      db_connected: !error,
    };

    console.log(JSON.stringify({ ...response, level: "info", function: "health" }));

    return new Response(JSON.stringify(response), {
      status: error ? 503 : 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const response = {
      status: "unhealthy",
      request_id: requestId,
      timestamp: new Date().toISOString(),
      error: e instanceof Error ? e.message : "Unknown error",
    };

    console.error(JSON.stringify({ ...response, level: "error", function: "health" }));

    return new Response(JSON.stringify(response), {
      status: 503,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
