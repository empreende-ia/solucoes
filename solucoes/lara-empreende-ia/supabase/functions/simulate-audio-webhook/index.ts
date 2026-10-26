import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Transcribe audio using ElevenLabs Scribe v1
async function transcribeAudio(
  audioBuffer: ArrayBuffer, 
  mimeType: string,
  supabase: any,
  userId: string
): Promise<string | null> {
  // Fetch ElevenLabs API key from lara_settings com fallback triplo (user_id → global → any)
  let settings = null;
  
  // 1. Tentar por user_id
  const { data: userSettings, error: userError } = await supabase
    .from('lara_settings')
    .select('elevenlabs_api_key')
    .eq('user_id', userId)
    .maybeSingle();
  
  if (userError) {
    console.error('Error fetching lara_settings by user_id:', userError);
  } else {
    settings = userSettings;
  }
  
  // 2. Se não encontrou, tentar global
  if (!settings?.elevenlabs_api_key) {
    const { data: globalSettings } = await supabase
      .from('lara_settings')
      .select('elevenlabs_api_key')
      .is('user_id', null)
      .maybeSingle();
    if (globalSettings?.elevenlabs_api_key) {
      settings = globalSettings;
    }
  }
  
  // 3. Fallback: qualquer settings
  if (!settings?.elevenlabs_api_key) {
    const { data: anySettings } = await supabase
      .from('lara_settings')
      .select('elevenlabs_api_key')
      .not('elevenlabs_api_key', 'is', null)
      .limit(1)
      .maybeSingle();
    settings = anySettings;
  }

  if (!settings?.elevenlabs_api_key) {
    console.error('ElevenLabs API key not configured in any lara_settings');
    return null;
  }

  try {
    const formData = new FormData();
    const extension = mimeType.split('/')[1] || 'ogg';
    const blob = new Blob([audioBuffer], { type: mimeType });
    formData.append('file', blob, `audio.${extension}`);
    formData.append('model_id', 'scribe_v1');

    console.log('Transcribing audio with ElevenLabs Scribe v1...');
    
    const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
      method: 'POST',
      headers: {
        'xi-api-key': settings.elevenlabs_api_key,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('ElevenLabs STT error:', response.status, errorText);
      return null;
    }

    const result = await response.json();
    console.log('Transcription result:', result);
    
    // ElevenLabs returns { text: "..." }
    return result.text || null;
  } catch (error) {
    console.error('Error transcribing audio:', error);
    return null;
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { phone, name, audio_base64, audio_mime_type } = await req.json();

    // Validate required fields
    if (!phone || !audio_base64) {
      return new Response(
        JSON.stringify({ error: 'phone and audio_base64 are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const mimeType = audio_mime_type || 'audio/ogg';

    // Initialize Supabase client early (needed for transcription)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user_id from auth token for multi-tenant support
    const authHeader = req.headers.get('authorization');
    let userId: string | null = null;

    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      const { data: { user } } = await supabase.auth.getUser(token);
      userId = user?.id || null;
    }

    if (!userId) {
      return new Response(
        JSON.stringify({ error: 'Autenticação necessária' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[simulate-audio-webhook] Processing audio from ${phone}, mime: ${mimeType} (user: ${userId})`);

    // Decode base64 to ArrayBuffer
    const binaryString = atob(audio_base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const audioBuffer = bytes.buffer;
    console.log(`[simulate-audio-webhook] Decoded audio: ${audioBuffer.byteLength} bytes`);

    // Transcribe audio using ElevenLabs Scribe (with userId for multi-tenant)
    const transcription = await transcribeAudio(audioBuffer, mimeType, supabase, userId);
    
    if (!transcription) {
      return new Response(
        JSON.stringify({ error: 'Failed to transcribe audio. Check if ElevenLabs API key is configured in Settings.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[simulate-audio-webhook] Transcription: "${transcription}"`);

    // Get whatsapp_phone_number_id from settings com fallback triplo
    let phoneSettings = null;
    
    const { data: userPhoneSettings } = await supabase
      .from('lara_settings')
      .select('whatsapp_phone_number_id')
      .eq('user_id', userId)
      .maybeSingle();
    phoneSettings = userPhoneSettings;
    
    if (!phoneSettings) {
      const { data: globalPhoneSettings } = await supabase
        .from('lara_settings')
        .select('whatsapp_phone_number_id')
        .is('user_id', null)
        .maybeSingle();
      phoneSettings = globalPhoneSettings;
    }
    
    if (!phoneSettings) {
      const { data: anyPhoneSettings } = await supabase
        .from('lara_settings')
        .select('whatsapp_phone_number_id')
        .limit(1)
        .maybeSingle();
      phoneSettings = anyPhoneSettings;
    }

    const phoneNumberId = phoneSettings?.whatsapp_phone_number_id || 'simulated';

    // Find or create contact (single-tenant - no user_id filter)
    let { data: contact, error: contactError } = await supabase
      .from('contacts')
      .select('*')
      .eq('phone_number', phone)
      .maybeSingle();

    if (!contact) {
      const { data: newContact, error: createError } = await supabase
        .from('contacts')
        .insert({
          phone_number: phone,
          name: name || null,
          call_name: name || null,
          whatsapp_id: phone,
          user_id: null, // Single-tenant: global contact
        })
        .select()
        .single();

      if (createError) {
        console.error('Error creating contact:', createError);
        throw createError;
      }
      contact = newContact;
      console.log(`[simulate-audio-webhook] Created new contact: ${contact.id}`);
    } else {
      console.log(`[simulate-audio-webhook] Found existing contact: ${contact.id}`);
    }

    // Find or create conversation (single-tenant - no user_id filter)
    let { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('*')
      .eq('contact_id', contact.id)
      .eq('is_active', true)
      .maybeSingle();

    if (!conversation) {
      const { data: newConv, error: createConvError } = await supabase
        .from('conversations')
        .insert({
          contact_id: contact.id,
          status: 'lara',
          is_active: true,
          user_id: null, // Single-tenant: global conversation
        })
        .select()
        .single();

      if (createConvError) {
        console.error('Error creating conversation:', createConvError);
        throw createConvError;
      }
      conversation = newConv;
      console.log(`[simulate-audio-webhook] Created new conversation: ${conversation.id}`);
    } else {
      console.log(`[simulate-audio-webhook] Found existing conversation: ${conversation.id}`);
    }

    // Create message with type='audio' and transcription as content
    const { data: message, error: msgError } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversation.id,
        content: transcription,
        type: 'audio',
        from_type: 'user',
        status: 'delivered',
        whatsapp_message_id: `sim_audio_${Date.now()}`,
        metadata: {
          simulated: true,
          original_audio_mime: mimeType,
          audio_size_bytes: audioBuffer.byteLength,
          transcription_source: 'elevenlabs_scribe',
        },
      })
      .select()
      .single();

    if (msgError) {
      console.error('Error creating message:', msgError);
      throw msgError;
    }
    console.log(`[simulate-audio-webhook] Created message: ${message.id}`);

    // Update conversation last_message_at
    await supabase
      .from('conversations')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', conversation.id);

    // Queue for Lara processing if status is 'lara'
    let queuedForLara = false;
    if (conversation.status === 'lara') {
      const { error: queueError } = await supabase
        .from('lara_processing_queue')
        .insert({
          conversation_id: conversation.id,
          contact_id: contact.id,
          message_id: message.id,
          status: 'pending',
          priority: 5,
        });

      if (queueError) {
        console.error('Error queuing for Lara:', queueError);
      } else {
        queuedForLara = true;
        console.log(`[simulate-audio-webhook] Queued message for Lara processing`);

        // Trigger lara-orchestrator
        try {
          const orchestratorUrl = `${supabaseUrl}/functions/v1/lara-orchestrator`;
          console.log(`[simulate-audio-webhook] Triggering lara-orchestrator...`);
          
          const orchestratorResponse = await fetch(orchestratorUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseKey}`,
            },
            body: JSON.stringify({ trigger: 'simulate-audio-webhook' }),
          });

          if (!orchestratorResponse.ok) {
            console.error('lara-orchestrator error:', await orchestratorResponse.text());
          } else {
            console.log('[simulate-audio-webhook] lara-orchestrator triggered successfully');
          }
        } catch (orchError) {
          console.error('Error triggering lara-orchestrator:', orchError);
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        transcription,
        contact_id: contact.id,
        conversation_id: conversation.id,
        message_id: message.id,
        queued_for_lara: queuedForLara,
        conversation_status: conversation.status,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[simulate-audio-webhook] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
