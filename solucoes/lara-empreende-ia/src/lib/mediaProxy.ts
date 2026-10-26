import { supabase } from '@/integrations/supabase/client';

// URL do proxy de mídia da Zernio (edge function zernio-media).
// Tags <img>/<audio>/<video> não enviam headers, então o access token
// do usuário vai na query e a function valida antes de repassar a mídia.

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

// Leitura síncrona do localStorage: sem ela, o primeiro render do chat
// poderia acontecer antes do getSession() resolver e a mídia não aparecia
function readTokenSync(): string | null {
  try {
    const key = Object.keys(localStorage).find((k) => k.startsWith('sb-') && k.endsWith('-auth-token'));
    if (!key) return null;
    const parsed = JSON.parse(localStorage.getItem(key) ?? 'null');
    return parsed?.access_token ?? null;
  } catch {
    return null;
  }
}

let accessToken: string | null = readTokenSync();

supabase.auth
  .getSession()
  .then(({ data }) => {
    accessToken = data.session?.access_token ?? accessToken;
  })
  // Sem o catch, uma falha de rede na carga do módulo virava unhandled rejection.
  // O token lido do localStorage segue valendo como fallback.
  .catch((error) => {
    console.error('[mediaProxy] Falha ao recuperar a sessão:', error);
  });
supabase.auth.onAuthStateChange((_event, session) => {
  accessToken = session?.access_token ?? null;
});

export function zernioMediaUrl(messageId: string): string | null {
  if (!accessToken) return null;
  const params = new URLSearchParams({ id: messageId, token: accessToken });
  return `${SUPABASE_URL}/functions/v1/zernio-media?${params.toString()}`;
}
