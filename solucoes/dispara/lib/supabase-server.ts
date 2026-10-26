import 'server-only'

import { connection } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseAdmin } from '@/lib/supabase'

/**
 * Client Supabase para código server-side (server actions, route handlers, RSC).
 *
 * Usa a SERVICE ROLE (SUPABASE_SECRET_KEY / SUPABASE_SERVICE_ROLE_KEY), que bypassa RLS.
 * O app não usa Supabase Auth: a chave publishable (role anon) não tem mais acesso a
 * nenhuma tabela (migration 20261011000000_security_hardening.sql), e quem autoriza a
 * request é o proxy.ts (sessão do dashboard, API key, cron ou atendente — ver
 * lib/route-policy.ts e lib/principal.ts). Por isso este módulo:
 * - só pode ser importado no servidor (`server-only` quebra o build se for parar no bundle);
 * - só deve ser usado em código que já passou pela autorização do proxy (rotas e páginas
 *   protegidas, server actions do dashboard).
 *
 * Mantém a assinatura async por compatibilidade com os chamadores.
 */
export async function createClient(): Promise<SupabaseClient> {
    // A versão anterior lia cookies(), o que deixava as páginas que usam este client
    // dinâmicas. connection() preserva isso: sem ele, páginas com `revalidate` virariam
    // ISR/prerender no build, consultando o banco com service role e servindo HTML
    // cacheado (e o build quebraria sem as env vars do Supabase).
    await connection()

    const client = getSupabaseAdmin()
    if (!client) {
        throw new Error(
            'Supabase não configurado: defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SECRET_KEY (ou SUPABASE_SERVICE_ROLE_KEY)'
        )
    }
    return client
}
