import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  console.log('[test-elevenlabs-tts] Starting TTS generation...');

  try {
    // Always require authentication before any processing
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const authedSupabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
    );
    const { data: authData, error: authError } = await authedSupabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );
    if (authError || !authData?.user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { 
      text, 
      apiKey, 
      voiceId: bodyVoiceId, 
      model: bodyModel,
      stability: bodyStability,
      similarityBoost: bodySimilarityBoost,
      speed: bodySpeed
    } = await req.json();

    if (!text || typeof text !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Texto é obrigatório' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (text.length > 1000) {
      return new Response(
        JSON.stringify({ error: 'Texto muito longo (máximo 1000 caracteres)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use API key from body if provided (for testing before saving)
    let finalApiKey = apiKey;
    let finalVoiceId = bodyVoiceId || '33B4UnXyTNbgLmdEDh5P';
    let finalModel = bodyModel || 'eleven_turbo_v2_5';
    let finalStability = bodyStability ?? 0.75;
    let finalSimilarityBoost = bodySimilarityBoost ?? 0.80;
    let finalSpeed = bodySpeed ?? 1.0;

    // If no API key in body, try to get from database
    if (!finalApiKey) {
      // Get Supabase client
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      // Get user from authorization header for multi-tenant
      const authHeader = req.headers.get('authorization');
      let userId: string | null = null;
      
      if (authHeader) {
        const token = authHeader.replace('Bearer ', '');
        const { data: { user } } = await supabase.auth.getUser(token);
        userId = user?.id || null;
      }

      // Load ElevenLabs settings from lara_settings (triple fallback for single-tenant)
      const selectFields = 'elevenlabs_api_key, elevenlabs_voice_id, elevenlabs_model, elevenlabs_stability, elevenlabs_similarity_boost, elevenlabs_style, elevenlabs_speed, elevenlabs_speaker_boost';
      let settings = null;
      let settingsError = null;

      // 1. Try by user_id
      if (userId) {
        const { data, error } = await supabase
          .from('lara_settings')
          .select(selectFields)
          .eq('user_id', userId)
          .maybeSingle();
        settings = data;
        settingsError = error;
      }

      // 2. Fallback: global (user_id IS NULL)
      if (!settings) {
        const { data, error } = await supabase
          .from('lara_settings')
          .select(selectFields)
          .is('user_id', null)
          .maybeSingle();
        settings = data;
        if (!settingsError) settingsError = error;
      }

      // 3. Last fallback: any settings with ElevenLabs configured
      if (!settings) {
        const { data, error } = await supabase
          .from('lara_settings')
          .select(selectFields)
          .not('elevenlabs_api_key', 'is', null)
          .limit(1)
          .maybeSingle();
        settings = data;
        if (!settingsError) settingsError = error;
      }

      if (settingsError) {
        console.error('[test-elevenlabs-tts] Error loading settings:', settingsError);
        return new Response(
          JSON.stringify({ error: 'Erro ao carregar configurações' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (!settings?.elevenlabs_api_key) {
        return new Response(
          JSON.stringify({ error: 'API Key da ElevenLabs não configurada. Configure em Settings → APIs.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      finalApiKey = settings.elevenlabs_api_key;
      finalVoiceId = bodyVoiceId || settings.elevenlabs_voice_id || '33B4UnXyTNbgLmdEDh5P';
      finalModel = bodyModel || settings.elevenlabs_model || 'eleven_turbo_v2_5';
      finalStability = bodyStability ?? settings.elevenlabs_stability ?? 0.75;
      finalSimilarityBoost = bodySimilarityBoost ?? settings.elevenlabs_similarity_boost ?? 0.80;
      finalSpeed = bodySpeed ?? 1.0;
    }

    console.log(`[test-elevenlabs-tts] Generating audio with voice: ${finalVoiceId}, model: ${finalModel}`);
    console.log(`[test-elevenlabs-tts] Text length: ${text.length} chars`);

    // Call ElevenLabs API
    const elevenLabsResponse = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${finalVoiceId}`,
      {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': finalApiKey,
        },
        body: JSON.stringify({
          text,
          model_id: finalModel,
          voice_settings: {
            stability: finalStability,
            similarity_boost: finalSimilarityBoost,
            style: 0.30,
            use_speaker_boost: true,
          },
        }),
      }
    );

    if (!elevenLabsResponse.ok) {
      const errorText = await elevenLabsResponse.text();
      console.error('[test-elevenlabs-tts] ElevenLabs API error:', elevenLabsResponse.status, errorText);
      
      if (elevenLabsResponse.status === 401) {
        return new Response(
          JSON.stringify({ error: 'API Key da ElevenLabs inválida' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      if (elevenLabsResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Limite de requisições excedido. Tente novamente em alguns segundos.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ error: `Erro na API ElevenLabs: ${elevenLabsResponse.status}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Convert audio to base64
    const arrayBuffer = await elevenLabsResponse.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    
    // Convert to base64 using built-in btoa
    let binary = '';
    for (let i = 0; i < uint8Array.length; i++) {
      binary += String.fromCharCode(uint8Array[i]);
    }
    const audioBase64 = btoa(binary);

    const duration = Date.now() - startTime;
    const sizeKB = (arrayBuffer.byteLength / 1024).toFixed(1);
    
    console.log(`[test-elevenlabs-tts] Audio generated successfully in ${duration}ms (${sizeKB}KB)`);

    return new Response(
      JSON.stringify({
        success: true,
        audioBase64,
        format: 'mp3',
        duration_ms: duration,
        size_kb: parseFloat(sizeKB),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[test-elevenlabs-tts] Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erro desconhecido' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
