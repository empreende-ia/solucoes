import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
};

async function verifyApiKey(sb: any, apiKey: string) {
  // Hash the provided key and check against stored hashes
  const encoder = new TextEncoder();
  const data = encoder.encode(apiKey);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b: number) => b.toString(16).padStart(2, "0")).join("");

  const { data: keyRecord, error } = await sb
    .from("api_keys")
    .select("id,org_id,is_active")
    .eq("key_hash", hashHex)
    .eq("is_active", true)
    .single();

  if (error || !keyRecord) return null;

  // Update last used and request count
  await sb.from("api_keys").update({
    last_used_at: new Date().toISOString(),
    request_count: keyRecord.request_count ? keyRecord.request_count + 1 : 1,
  }).eq("id", keyRecord.id);

  return keyRecord.org_id;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Auth via Bearer token
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Authorization header required" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const apiKey = authHeader.replace("Bearer ", "");
  const orgId = await verifyApiKey(sb, apiKey);
  if (!orgId) {
    return new Response(JSON.stringify({ error: "Invalid or revoked API key" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const url = new URL(req.url);
  // Parse path: /public-api/contacts or /public-api/contacts/:id
  const pathParts = url.pathname.split("/").filter(Boolean);
  // pathParts: ["public-api", "contacts"] or ["public-api", "contacts", "uuid"]
  const entity = pathParts[1];
  const entityId = pathParts[2];

  const validEntities = ["contacts", "companies", "deals", "activities"];
  if (!entity || !validEntities.includes(entity)) {
    return new Response(JSON.stringify({ error: "Invalid entity. Use: " + validEntities.join(", ") }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    let result;

    if (req.method === "GET") {
      const limit = parseInt(url.searchParams.get("limit") || "50");
      const offset = parseInt(url.searchParams.get("offset") || "0");
      if (entityId) {
        result = await sb.from(entity).select("*").eq("org_id", orgId).eq("id", entityId).single();
      } else {
        result = await sb.from(entity).select("*").eq("org_id", orgId).range(offset, offset + limit - 1);
      }
    } else if (req.method === "POST") {
      const body = await req.json();
      result = await sb.from(entity).insert({ ...body, org_id: orgId }).select().single();
    } else if (req.method === "PUT") {
      if (!entityId) return new Response(JSON.stringify({ error: "ID required for update" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
      const body = await req.json();
      const { id, org_id, ...updateData } = body;
      result = await sb.from(entity).update(updateData).eq("id", entityId).eq("org_id", orgId).select().single();
    } else if (req.method === "DELETE") {
      if (!entityId) return new Response(JSON.stringify({ error: "ID required for delete" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
      result = await sb.from(entity).delete().eq("id", entityId).eq("org_id", orgId);
    } else {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (result.error) {
      return new Response(JSON.stringify({ error: result.error.message }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ data: result.data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("public-api error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
