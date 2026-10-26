import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import {
  ATTENDANT_COOKIE_NAME,
  readAttendantToken,
  resolveAttendantTokenDetailed,
} from '@/lib/attendant-auth';
import type { AttendantPrincipal } from '@/lib/principal';

/**
 * Entrada da PWA de atendente (/atendimento).
 *
 * - POST {token}: valida o token do link e grava o cookie httpOnly
 *   `dispara_attendant`. Daí em diante a PWA não precisa mais do ?token= na URL.
 * - GET: restaura a sessão a partir do cookie (PWA aberta pelo start_url do
 *   manifest, shortcut, clique em notificação — todos chegam SEM ?token=).
 * - DELETE: apaga o cookie (logout do atendente).
 *
 * A política do proxy para esta rota é `public_route_auth`: a verificação é toda
 * feita aqui, via resolveAttendantTokenDetailed (mesma fonte usada pelo proxy).
 *
 * Banco indisponível ≠ token inválido: em 'unavailable' a resposta é 503 com
 * Retry-After e o cookie NÃO é tocado (a PWA mostra "reconectando" e tenta de
 * novo). Só 'invalid' apaga o cookie.
 */

// 30 dias: teto da sessão do atendente no navegador (o token pode expirar antes).
const MAX_COOKIE_AGE_SECONDS = 60 * 60 * 24 * 30;

// Mensagem única para inexistente/inativo/expirado — não revela qual é o caso.
const INVALID_TOKEN_MESSAGE = 'Token inválido ou expirado';
const NO_SESSION_MESSAGE = 'Sessão de atendente não encontrada. Abra o link de acesso enviado pelo administrador.';
const UNAVAILABLE_MESSAGE = 'Não foi possível validar o acesso agora: banco de dados indisponível. Tente novamente em instantes.';

// Mesmo valor do 503 do proxy para sessão indisponível.
const RETRY_AFTER_SECONDS = '5';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' };

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge,
  };
}

/** maxAge do cookie: até o expires_at do token ou 30 dias, o que vier primeiro. */
function computeAttendantCookieMaxAge(expiresAt: string | null | undefined, now = Date.now()): number {
  if (!expiresAt) return MAX_COOKIE_AGE_SECONDS;
  const expiresMs = new Date(expiresAt).getTime();
  if (Number.isNaN(expiresMs)) return MAX_COOKIE_AGE_SECONDS;
  const remaining = Math.floor((expiresMs - now) / 1000);
  return Math.min(MAX_COOKIE_AGE_SECONDS, remaining);
}

/**
 * Registra o acesso (last_used_at/access_count) e devolve o expires_at atual do token.
 * Falha ao registrar não bloqueia o login (mesmo comportamento de antes).
 */
async function registerAccess(attendantId: string): Promise<{ expiresAt: string | null }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { expiresAt: null };

  const { data, error } = await supabase
    .from('attendant_tokens')
    .select('access_count, expires_at')
    .eq('id', attendantId)
    .maybeSingle();

  if (error || !data) {
    if (error) console.error('[API] Erro ao ler token de atendente:', error.message);
    return { expiresAt: null };
  }

  const { error: updateError } = await supabase
    .from('attendant_tokens')
    .update({
      last_used_at: new Date().toISOString(),
      access_count: (Number(data.access_count) || 0) + 1,
    })
    .eq('id', attendantId);

  if (updateError) {
    console.error('[API] Erro ao registrar acesso do atendente:', updateError.message);
  }

  return { expiresAt: (data.expires_at as string | null) ?? null };
}

function invalidResponse(message: string, clearCookie: boolean): NextResponse {
  const response = NextResponse.json(
    { valid: false, error: message },
    { status: 401, headers: NO_STORE_HEADERS }
  );
  if (clearCookie) response.cookies.set(ATTENDANT_COOKIE_NAME, '', cookieOptions(0));
  return response;
}

/** Banco indisponível: 503 transitório, sem Set-Cookie (a sessão do atendente fica intacta). */
function unavailableResponse(): NextResponse {
  return NextResponse.json(
    { valid: false, error: UNAVAILABLE_MESSAGE, reason: 'attendant_store_unavailable' },
    { status: 503, headers: { ...NO_STORE_HEADERS, 'Retry-After': RETRY_AFTER_SECONDS } }
  );
}

/** Resposta de sucesso (sem o token em si) + cookie de sessão renovado. */
async function sessionResponse(attendant: AttendantPrincipal, token: string): Promise<NextResponse> {
  const { expiresAt } = await registerAccess(attendant.id);
  const maxAge = computeAttendantCookieMaxAge(expiresAt);

  // Token expirou entre a validação (cacheada) e agora.
  if (maxAge <= 0) return invalidResponse(INVALID_TOKEN_MESSAGE, true);

  const response = NextResponse.json(
    {
      valid: true,
      attendant: {
        id: attendant.id,
        name: attendant.name,
        permissions: attendant.permissions,
      },
    },
    { headers: NO_STORE_HEADERS }
  );
  response.cookies.set(ATTENDANT_COOKIE_NAME, token, cookieOptions(maxAge));
  return response;
}

// =============================================================================
// POST - Validar token do link e iniciar a sessão (cookie)
// =============================================================================

export async function POST(request: NextRequest) {
  try {
    let token: unknown = null;
    try {
      const body = await request.json();
      token = body?.token;
    } catch {
      // Body ausente/inválido: tratado como token não informado.
    }

    if (typeof token !== 'string' || !token.trim()) {
      return NextResponse.json(
        { valid: false, error: 'Token não informado' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const trimmed = token.trim();
    const result = await resolveAttendantTokenDetailed(trimmed);
    if (result.status === 'unavailable') return unavailableResponse();
    if (result.status === 'invalid') return invalidResponse(INVALID_TOKEN_MESSAGE, false);

    return await sessionResponse(result.principal, trimmed);
  } catch (error) {
    console.error('[API] Erro ao validar token:', error);
    return NextResponse.json(
      { valid: false, error: 'Erro ao validar token' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

// =============================================================================
// GET - Restaurar a sessão a partir do cookie
// =============================================================================

export async function GET(request: NextRequest) {
  try {
    const token = readAttendantToken(request)?.trim();
    if (!token) return invalidResponse(NO_SESSION_MESSAGE, false);

    const result = await resolveAttendantTokenDetailed(token);
    // Oscilação do banco: NÃO apaga o cookie (senão o atendente fica trancado
    // até receber um novo link). A PWA tenta de novo com backoff.
    if (result.status === 'unavailable') return unavailableResponse();
    // Cookie com token revogado/expirado: apaga para não ficar tentando.
    if (result.status === 'invalid') return invalidResponse(INVALID_TOKEN_MESSAGE, true);

    return await sessionResponse(result.principal, token);
  } catch (error) {
    console.error('[API] Erro ao restaurar sessão de atendente:', error);
    return NextResponse.json(
      { valid: false, error: 'Erro ao validar sessão' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

// =============================================================================
// DELETE - Logout do atendente (apaga o cookie)
// =============================================================================

export async function DELETE() {
  const response = NextResponse.json({ success: true }, { headers: NO_STORE_HEADERS });
  response.cookies.set(ATTENDANT_COOKIE_NAME, '', cookieOptions(0));
  return response;
}
