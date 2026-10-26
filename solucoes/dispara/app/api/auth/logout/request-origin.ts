/**
 * De onde veio a request, pelos metadados que o próprio browser preenche (uma página
 * de outro site não consegue forjá-los num form POST):
 *
 * - `Sec-Fetch-Site` (Chrome 76+, Firefox 90+, Safari 16.4+): decide sozinho. Só
 *   'same-origin' conta; 'same-site' (subdomínio vizinho), 'cross-site' e 'none' não.
 * - Sem ele, `Origin` comparado com a origem desta instância (URL da request e o host
 *   repassado pelo proxy reverso, como no CORS do proxy.ts). `Origin: null` não confere.
 * - Sem nenhum dos dois: 'unknown' — cliente fora do browser (curl, script) ou browser
 *   muito antigo. Quem chama decide o que fazer.
 */

export type RequestOriginKind = 'same-origin' | 'cross-origin' | 'unknown'

/** Primeiro valor de um header que proxies encadeados podem repetir ("a, b"). */
function firstHeaderValue(request: Request, name: string): string | null {
  const value = request.headers.get(name)?.split(',')[0]?.trim()
  return value || null
}

function ownOrigins(request: Request): string[] {
  const url = new URL(request.url)
  const origins = [url.origin.toLowerCase()]
  const host = firstHeaderValue(request, 'x-forwarded-host') || firstHeaderValue(request, 'host')
  if (host) {
    const forwardedProto = firstHeaderValue(request, 'x-forwarded-proto')
    // Proxy que termina TLS sem repassar X-Forwarded-Proto: a URL interna chega como
    // http mas o browser manda Origin https. Para CSRF o que importa é o HOST (um
    // atacante não controla o nosso host em nenhum esquema), então aceita os dois.
    const protos = forwardedProto ? [forwardedProto] : ['http', 'https']
    for (const proto of protos) origins.push(`${proto}://${host}`.toLowerCase())
  }
  return origins
}

export function classifyRequestOrigin(request: Request): RequestOriginKind {
  const fetchSite = request.headers.get('sec-fetch-site')
  if (fetchSite) {
    return fetchSite.trim().toLowerCase() === 'same-origin' ? 'same-origin' : 'cross-origin'
  }

  const origin = request.headers.get('origin')
  if (!origin) return 'unknown'

  return ownOrigins(request).includes(origin.trim().toLowerCase()) ? 'same-origin' : 'cross-origin'
}
