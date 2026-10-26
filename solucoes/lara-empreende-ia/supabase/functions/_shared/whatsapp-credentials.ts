/**
 * Resolução de credenciais WhatsApp em lara_settings, fiel à semântica do
 * whatsapp-sender (linhas ~148-191): avança de nível SOMENTE quando a linha não
 * existe — por usuário → global (user_id nulo) → qualquer linha com telefone.
 * Linha encontrada porém incompleta é erro de configuração do registro, nunca
 * fallback silencioso: divergir aqui faria a UI de templates gerenciar uma WABA
 * enquanto o envio sai por outra conta.
 */

export interface LaraWhatsAppRow {
  whatsapp_access_token: string | null;
  whatsapp_phone_number_id: string | null;
  whatsapp_business_account_id: string | null;
}

const COLUMNS = 'whatsapp_access_token, whatsapp_phone_number_id, whatsapp_business_account_id';

// deno-lint-ignore no-explicit-any
export async function resolveLaraWhatsAppRow(service: any, userId: string | null): Promise<LaraWhatsAppRow | null> {
  let row: LaraWhatsAppRow | null = null;
  if (userId) {
    const { data, error } = await service.from('lara_settings').select(COLUMNS).eq('user_id', userId).maybeSingle();
    if (error) throw error;
    row = data;
  }
  if (!row) {
    const { data, error } = await service.from('lara_settings').select(COLUMNS).is('user_id', null).maybeSingle();
    if (error) throw error;
    row = data;
  }
  if (!row) {
    const { data, error } = await service
      .from('lara_settings')
      .select(COLUMNS)
      .not('whatsapp_phone_number_id', 'is', null)
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    row = data;
  }
  return row;
}
