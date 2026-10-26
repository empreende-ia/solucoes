import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🧪 Test WhatsApp Message function invoked');

    const { phone_number, message } = await req.json();

    // Validate inputs
    if (!phone_number || !message) {
      console.error('❌ Missing required fields');
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Número de telefone e mensagem são obrigatórios' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate phone number format (should start with country code, no + needed here)
    const cleanPhone = phone_number.replace(/[^0-9]/g, '');
    if (cleanPhone.length < 10) {
      console.error('❌ Invalid phone number format:', phone_number);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Formato de número inválido. Use o formato internacional (ex: 5511999999999)' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('📱 Testing message to:', cleanPhone);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user_id from auth token for multi-tenant filtering
    let userId: string | null = null;
    const authHeader = req.headers.get('authorization');
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      const { data: { user } } = await supabase.auth.getUser(token);
      userId = user?.id || null;
    }

    if (!userId) {
      console.error('❌ No authenticated user');
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Usuário não autenticado' 
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch WhatsApp credentials from lara_settings com fallback triplo
    console.log('🔍 Fetching WhatsApp credentials for user:', userId);
    let settings = null;

    // 1. Tentar por user_id
    const { data: userSettings } = await supabase
      .from('lara_settings')
      .select('whatsapp_access_token, whatsapp_phone_number_id')
      .eq('user_id', userId)
      .maybeSingle();
    settings = userSettings;

    // 2. Fallback: buscar global (user_id IS NULL)
    if (!settings) {
      console.log('🔍 No user-specific settings, trying global...');
      const { data: globalSettings } = await supabase
        .from('lara_settings')
        .select('whatsapp_access_token, whatsapp_phone_number_id')
        .is('user_id', null)
        .maybeSingle();
      settings = globalSettings;
    }

    // 3. Último fallback: qualquer settings com WhatsApp configurado
    if (!settings) {
      console.log('🔍 No global settings, fetching any with WhatsApp...');
      const { data: anySettings } = await supabase
        .from('lara_settings')
        .select('whatsapp_access_token, whatsapp_phone_number_id')
        .not('whatsapp_phone_number_id', 'is', null)
        .limit(1)
        .maybeSingle();
      settings = anySettings;
    }

    if (!settings) {
      console.error('❌ No settings found with any fallback');
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Sistema não configurado. Acesse /settings para configurar o sistema primeiro.' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!settings.whatsapp_access_token || !settings.whatsapp_phone_number_id) {
      console.error('❌ WhatsApp not configured');
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'WhatsApp não está configurado. Configure as credenciais primeiro.' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ========================================
    // 1. Get or create contact (single-tenant - no user_id filter)
    // ========================================
    console.log('📇 Getting or creating contact...');
    const { data: existingContact } = await supabase
      .from('contacts')
      .select('*')
      .eq('phone_number', cleanPhone)
      .maybeSingle();

    let contactId: string;

    if (existingContact) {
      contactId = existingContact.id;
      console.log('📇 Using existing contact:', contactId);
    } else {
      const { data: newContact, error: contactError } = await supabase
        .from('contacts')
        .insert({
          phone_number: cleanPhone,
          whatsapp_id: cleanPhone,
          user_id: null, // Single-tenant: global contact
        })
        .select()
        .single();

      if (contactError) {
        console.error('❌ Error creating contact:', contactError);
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'Erro ao criar contato: ' + contactError.message 
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      contactId = newContact.id;
      console.log('📇 Created new contact:', contactId);
    }

    // ========================================
    // 2. Get or create active conversation (single-tenant - no user_id filter)
    // ========================================
    console.log('💬 Getting or creating conversation...');
    const { data: existingConversation } = await supabase
      .from('conversations')
      .select('*')
      .eq('contact_id', contactId)
      .eq('is_active', true)
      .maybeSingle();

    let conversationId: string;

    if (existingConversation) {
      conversationId = existingConversation.id;
      console.log('💬 Using existing conversation:', conversationId);
    } else {
      const { data: newConversation, error: convError } = await supabase
        .from('conversations')
        .insert({
          contact_id: contactId,
          status: 'lara',
          is_active: true,
          user_id: null, // Single-tenant: global conversation
        })
        .select()
        .single();

      if (convError) {
        console.error('❌ Error creating conversation:', convError);
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'Erro ao criar conversa: ' + convError.message 
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      conversationId = newConversation.id;
      console.log('💬 Created new conversation:', conversationId);
    }

    // ========================================
    // 3. Create message record (BEFORE sending)
    // ========================================
    console.log('📝 Creating message record...');
    const { data: newMessage, error: messageError } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        from_type: 'lara',
        type: 'text',
        content: message,
        status: 'processing',
      })
      .select()
      .single();

    if (messageError) {
      console.error('❌ Error creating message:', messageError);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Erro ao criar mensagem: ' + messageError.message 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    console.log('📝 Created message record:', newMessage.id);

    // ========================================
    // 4. Send message via WhatsApp Cloud API
    // ========================================
    const whatsappUrl = `https://graph.facebook.com/v17.0/${settings.whatsapp_phone_number_id}/messages`;
    
    console.log('📤 Sending test message to WhatsApp API...');
    const whatsappResponse = await fetch(whatsappUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${settings.whatsapp_access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: cleanPhone,
        type: 'text',
        text: {
          body: message
        }
      })
    });

    const whatsappData = await whatsappResponse.json();

    if (!whatsappResponse.ok) {
      console.error('❌ WhatsApp API error:', whatsappData);
      
      // Update message status to failed
      await supabase
        .from('messages')
        .update({ status: 'failed' })
        .eq('id', newMessage.id);

      return new Response(
        JSON.stringify({ 
          success: false, 
          error: whatsappData.error?.message || 'Erro ao enviar mensagem via WhatsApp',
          details: whatsappData
        }),
        { status: whatsappResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('✅ Message sent successfully:', whatsappData);

    // ========================================
    // 5. Update message with whatsapp_message_id and status
    // ========================================
    const whatsappMessageId = whatsappData.messages?.[0]?.id;
    await supabase
      .from('messages')
      .update({ 
        whatsapp_message_id: whatsappMessageId,
        status: 'sent'
      })
      .eq('id', newMessage.id);

    console.log('📝 Updated message with whatsapp_message_id:', whatsappMessageId);

    // ========================================
    // 6. Update conversation last_message_at
    // ========================================
    await supabase
      .from('conversations')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', conversationId);

    console.log('💬 Updated conversation last_message_at');

    return new Response(
      JSON.stringify({ 
        success: true, 
        message_id: whatsappMessageId,
        contact_id: contactId,
        conversation_id: conversationId,
        data: whatsappData
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Unexpected error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro inesperado ao enviar mensagem de teste';
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: errorMessage
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
