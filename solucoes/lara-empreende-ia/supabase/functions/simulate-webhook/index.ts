import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { phone, name, message, mode } = await req.json();
    // mode 'test' marca a conversa como lead de teste: o sender não entrega a
    // nada externo e a conversa pode ser removida depois em um clique.
    const isTest = mode === 'test';

    if (!phone || !message) {
      return new Response(
        JSON.stringify({ error: 'phone and message are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

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

    console.log(`[simulate-webhook] Simulating message from ${phone}: ${message} (user: ${userId})`);

    // Get phone_number_id from settings with fallback triplo (user_id → global → any)
    let settings = null;
    
    // 1. Tentar por user_id
    const { data: userSettings } = await supabase
      .from('lara_settings')
      .select('whatsapp_phone_number_id')
      .eq('user_id', userId)
      .maybeSingle();
    settings = userSettings;
    
    // 2. Se não encontrou, tentar global
    if (!settings) {
      const { data: globalSettings } = await supabase
        .from('lara_settings')
        .select('whatsapp_phone_number_id')
        .is('user_id', null)
        .maybeSingle();
      settings = globalSettings;
    }
    
    // 3. Fallback: qualquer settings
    if (!settings) {
      const { data: anySettings } = await supabase
        .from('lara_settings')
        .select('whatsapp_phone_number_id')
        .limit(1)
        .maybeSingle();
      settings = anySettings;
    }

    const phoneNumberId = settings?.whatsapp_phone_number_id || 'test_phone_id';

    // Get or create contact (single-tenant - no user_id filter)
    const { data: existingContact } = await supabase
      .from('contacts')
      .select('*')
      .eq('phone_number', phone)
      .maybeSingle();

    let contactId: string;

    if (existingContact) {
      contactId = existingContact.id;
      // Update name if provided
      if (name && existingContact.name !== name) {
        await supabase
          .from('contacts')
          .update({ name, updated_at: new Date().toISOString() })
          .eq('id', contactId);
      }
      console.log(`[simulate-webhook] Using existing contact: ${contactId}`);
    } else {
      const { data: newContact, error: contactError } = await supabase
        .from('contacts')
        .insert({
          phone_number: phone,
          name: name || null,
          whatsapp_id: phone,
          user_id: null, // Single-tenant: global contact
          tags: isTest ? ['teste'] : [],
        })
        .select()
        .single();

      if (contactError) throw contactError;
      contactId = newContact.id;
      console.log(`[simulate-webhook] Created new contact: ${contactId}`);
    }

    // Get or create active conversation (single-tenant - no user_id filter)
    const { data: existingConversation } = await supabase
      .from('conversations')
      .select('*')
      .eq('contact_id', contactId)
      .eq('is_active', true)
      .maybeSingle();

    let conversationId: string;

    if (existingConversation) {
      conversationId = existingConversation.id;
      console.log(`[simulate-webhook] Using existing conversation: ${conversationId}`);
    } else {
      const { data: newConversation, error: convError } = await supabase
        .from('conversations')
        .insert({
          contact_id: contactId,
          status: 'lara',
          is_active: true,
          user_id: null, // Single-tenant: global conversation
          metadata: isTest ? { test: true } : {},
        })
        .select()
        .single();

      if (convError) throw convError;
      conversationId = newConversation.id;
      console.log(`[simulate-webhook] Created new conversation: ${conversationId}`);
    }

    // Create message
    const { data: newMessage, error: messageError } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        from_type: 'user',
        type: 'text',
        content: message,
        status: 'delivered',
        whatsapp_message_id: `sim_${Date.now()}`,
      })
      .select()
      .single();

    if (messageError) throw messageError;
    console.log(`[simulate-webhook] Created message: ${newMessage.id}`);

    // Update conversation last_message_at
    await supabase
      .from('conversations')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', conversationId);

    // Queue for Lara processing if conversation is in 'lara' status
    const { data: conversation } = await supabase
      .from('conversations')
      .select('status')
      .eq('id', conversationId)
      .maybeSingle();

    let queuedForLara = false;
    if (conversation?.status === 'lara') {
      const { error: queueError } = await supabase
        .from('lara_processing_queue')
        .insert({
          message_id: newMessage.id,
          conversation_id: conversationId,
          contact_id: contactId,
          status: 'pending',
        });

      if (queueError) {
        console.error('[simulate-webhook] Error queuing for Lara:', queueError);
      } else {
        queuedForLara = true;
        console.log(`[simulate-webhook] Queued message for Lara processing`);
        
        // Trigger lara-orchestrator directly (cron jobs não funcionam sem pg_net)
        try {
          const orchestratorUrl = `${supabaseUrl}/functions/v1/lara-orchestrator`;
          console.log('[simulate-webhook] Triggering lara-orchestrator at:', orchestratorUrl);
          
          fetch(orchestratorUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseKey}`
            },
            body: JSON.stringify({ triggered_by: 'simulate-webhook' })
          }).catch(err => console.error('[simulate-webhook] Error triggering lara-orchestrator:', err));
        } catch (err) {
          console.error('[simulate-webhook] Failed to trigger lara-orchestrator:', err);
        }
      }
    }

    const result = {
      success: true,
      contact_id: contactId,
      conversation_id: conversationId,
      message_id: newMessage.id,
      queued_for_lara: queuedForLara,
      conversation_status: conversation?.status,
      test: isTest,
    };

    console.log('[simulate-webhook] Result:', result);

    return new Response(
      JSON.stringify(result),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('[simulate-webhook] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        success: false 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
