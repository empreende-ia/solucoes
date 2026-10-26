import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type RequestBody = {
  api_key?: string;
  from_email?: string;
  from_name?: string;
  test_to?: string;
  org_id?: string;
};

function json(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isDomainVerificationError(message: string) {
  const normalized = message.toLowerCase();

  return [
    "verify a domain",
    "domain is not verified",
    "verified domain",
    "from address",
    "testing emails are only allowed",
    "sender domain",
  ].some((token) => normalized.includes(token));
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json(401, { error: "Unauthorized" });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      console.error("validate-resend-key missing env", {
        hasSupabaseUrl: !!supabaseUrl,
        hasServiceRoleKey: !!serviceRoleKey,
        hasAnonKey: !!anonKey,
      });

      return json(500, { error: "Server configuration error" });
    }

    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      return json(401, { error: "Unauthorized" });
    }

    const { api_key, from_email, from_name, test_to, org_id } = (await req.json()) as RequestBody;

    if (!api_key || !from_email || !test_to || !org_id) {
      return json(400, { error: "Missing required fields" });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("org_id")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError || !profile || profile.org_id !== org_id) {
      return json(403, { error: "Forbidden" });
    }

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${api_key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: from_name?.trim() ? `${from_name.trim()} <${from_email.trim()}>` : from_email.trim(),
        to: [test_to.trim()],
        subject: "Teste de configuração de email",
        html: `<p>Configuração de email validada com sucesso para <strong>${from_email.trim()}</strong>.</p>`,
      }),
    });

    const resendBody = await resendResponse.json().catch(() => ({}));
    const resendMessage = [
      typeof resendBody?.message === "string" ? resendBody.message : "",
      typeof resendBody?.error?.message === "string" ? resendBody.error.message : "",
      typeof resendBody?.name === "string" ? resendBody.name : "",
    ]
      .filter(Boolean)
      .join(" ");

    if (!resendResponse.ok) {
      if (resendResponse.status === 401) {
        return json(200, { valid: false, error: "invalid_key" });
      }

      if (isDomainVerificationError(resendMessage)) {
        await adminClient.from("org_secrets").upsert(
          { org_id, key_name: "resend_api_key", key_value: api_key.trim() },
          { onConflict: "org_id,key_name" },
        );

        await adminClient.from("integration_configs").upsert(
          {
            org_id,
            provider: "resend",
            config: {
              from_email: from_email.trim(),
              from_name: from_name?.trim() || "",
              configured: true,
            },
            connected_by: user.id,
            is_active: true,
          },
          { onConflict: "org_id,provider" },
        );

        return json(200, { valid: false, error: "domain_not_verified", error_code: "domain_not_verified" });
      }

      console.error("validate-resend-key resend error", {
        status: resendResponse.status,
        message: resendMessage,
      });

      return json(500, { error: "resend_request_failed" });
    }

    const { error: secretError } = await adminClient.from("org_secrets").upsert(
      { org_id, key_name: "resend_api_key", key_value: api_key.trim() },
      { onConflict: "org_id,key_name" },
    );

    if (secretError) {
      console.error("validate-resend-key secret save error", secretError);
      return json(500, { error: "secret_save_failed" });
    }

    const { error: configError } = await adminClient.from("integration_configs").upsert(
      {
        org_id,
        provider: "resend",
        config: {
          from_email: from_email.trim(),
          from_name: from_name?.trim() || "",
          configured: true,
          last_test_email_id: resendBody?.id ?? null,
        },
        connected_by: user.id,
        is_active: true,
      },
      { onConflict: "org_id,provider" },
    );

    if (configError) {
      console.error("validate-resend-key config save error", configError);
      return json(500, { error: "config_save_failed" });
    }

    return json(200, { valid: true, id: resendBody?.id ?? null });
  } catch (err) {
    console.error("validate-resend-key unexpected error", err);
    return json(500, { error: "Internal error" });
  }
});