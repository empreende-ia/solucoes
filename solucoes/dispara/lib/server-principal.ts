import 'server-only'

import { headers } from 'next/headers'
import { getPrincipal, OWNER_KINDS, type Principal } from '@/lib/principal'

/**
 * Principal da request atual para RSC e Server Actions (lido dos headers
 * `x-dispara-*` que o proxy grava; ver lib/principal.ts).
 *
 * Defesa em profundidade: o proxy já barra quem não tem sessão, mas há caminhos em
 * que a página abre com principal `public` (modo degradado com banco fora) e um erro
 * de política futuro poderia abrir outros. Loaders que consultam o banco com service
 * role checam isto no topo e, sem dono, devolvem vazio/null — a página renderiza só
 * o shell e o client busca pelas APIs (que o proxy protege).
 *
 * Não envolva em try/catch: fora de request (prerender), `headers()` lança o erro que
 * o Next usa para marcar a rota como dinâmica.
 */
export async function getServerPrincipal(): Promise<Principal | null> {
  const requestHeaders = await headers()
  // getPrincipal só lê `request.headers`.
  return getPrincipal({ headers: requestHeaders } as Pick<Request, 'headers'> as Request)
}

/** true quando a request vem do dono (sessão validada, API key ou admin key). */
export async function hasOwnerPrincipal(): Promise<boolean> {
  const principal = await getServerPrincipal()
  return !!principal && (OWNER_KINDS as readonly string[]).includes(principal.kind)
}
