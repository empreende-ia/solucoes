/**
 * Cliente HTTP com proteção contra SSRF para o passo "HTTP Request" do builder.
 *
 * - Só http: e https:.
 * - Bloqueia destinos privados/loopback/link-local/CGNAT/metadata/multicast/
 *   reservados (IPv4 e IPv6), inclusive formas "disfarçadas" que o parser de
 *   URL normaliza (2130706433, 0x7f.1, [::ffff:127.0.0.1], 0).
 * - Resolve o DNS e valida TODOS os IPs. A validação acontece no `lookup` da
 *   PRÓPRIA conexão (o IP checado é o IP conectado), o que fecha o DNS
 *   rebinding entre "validar" e "conectar".
 * - Redirect NÃO é automático: cada salto é revalidado (esquema + destino), com
 *   limite de saltos; Authorization/Cookie caem em salto cross-origin.
 * - Timeout total (todos os saltos) e limite de tamanho da resposta (inclusive
 *   após descompressão — protege contra gzip bomb).
 */
import { lookup as dnsLookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import { BlockList, isIP, type LookupFunction } from "node:net";
import type { Readable } from "node:stream";
import zlib from "node:zlib";

export const SAFE_HTTP_DEFAULT_TIMEOUT_MS = 15_000;
export const SAFE_HTTP_DEFAULT_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
export const SAFE_HTTP_DEFAULT_MAX_REDIRECTS = 5;

const ALLOWED_METHODS = new Set([
  "GET",
  "HEAD",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
]);

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

// Cabeçalhos que o chamador não controla (framing/conexão/roteamento).
const FORBIDDEN_REQUEST_HEADERS = new Set([
  "host",
  "content-length",
  "transfer-encoding",
  "connection",
  "keep-alive",
  "upgrade",
  "proxy-connection",
  "te",
  "trailer",
  "expect",
]);

// Removidos quando o redirect troca de origem (mesma regra do fetch).
const CROSS_ORIGIN_STRIPPED_HEADERS = ["authorization", "cookie", "proxy-authorization"];

const HEADER_NAME_PATTERN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

export type SafeHttpErrorCode =
  | "invalid_url"
  | "blocked_scheme"
  | "blocked_destination"
  | "dns_failure"
  | "invalid_method"
  | "too_many_redirects"
  | "response_too_large"
  | "timeout"
  | "network_error";

export class SafeHttpError extends Error {
  readonly code: SafeHttpErrorCode;

  constructor(code: SafeHttpErrorCode, message: string) {
    super(message);
    this.name = "SafeHttpError";
    this.code = code;
  }
}

export type ResolvedAddress = { address: string; family: 4 | 6 };

/** Resolve um hostname para TODOS os seus IPs. */
export type AddressResolver = (hostname: string) => Promise<ResolvedAddress[]>;

export type SafeHttpRequestOptions = {
  method?: string;
  headers?: Record<string, unknown>;
  body?: string;
  timeoutMs?: number;
  maxResponseBytes?: number;
  maxRedirects?: number;
  /** Injeção para testes (mock de DNS). Padrão: dns.lookup com all: true. */
  resolver?: AddressResolver;
  /** Injeção para testes. Padrão: isBlockedIpAddress. */
  isAddressBlocked?: (address: string) => boolean;
};

export type SafeHttpResponse = {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: Buffer;
  /** URL final (após redirects). */
  url: string;
};

// ─── Política de IPs ─────────────────────────────────────────────────────────

const BLOCKED_IPV4_SUBNETS: ReadonlyArray<[string, number]> = [
  ["0.0.0.0", 8], // "esta rede" (0.0.0.0 = todas as interfaces locais)
  ["10.0.0.0", 8], // privada (RFC 1918)
  ["100.64.0.0", 10], // CGNAT (RFC 6598)
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local — inclui metadata 169.254.169.254
  ["172.16.0.0", 12], // privada (RFC 1918)
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // TEST-NET-1
  ["192.88.99.0", 24], // relay 6to4
  ["192.168.0.0", 16], // privada (RFC 1918)
  ["198.18.0.0", 15], // benchmark
  ["198.51.100.0", 24], // TEST-NET-2
  ["203.0.113.0", 24], // TEST-NET-3
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reservado + broadcast 255.255.255.255
];

const BLOCKED_IPV6_SUBNETS: ReadonlyArray<[string, number]> = [
  ["::", 96], // não especificado (::), loopback (::1) e IPv4-compatible
  ["::ffff:0:0", 96], // IPv4-mapped (todo o bloco: sem exceção)
  ["64:ff9b::", 96], // NAT64 (embute IPv4)
  ["64:ff9b:1::", 48], // NAT64 uso local
  ["100::", 64], // discard
  ["2001::", 23], // IETF protocol assignments (Teredo, ORCHID...)
  ["2001:db8::", 32], // documentação
  ["2002::", 16], // 6to4 (embute IPv4)
  ["fc00::", 7], // unique local — inclui fd00::/8 (ex.: fd00:ec2::254 da AWS)
  ["fe80::", 10], // link-local
  ["fec0::", 10], // site-local (obsoleto)
  ["ff00::", 8], // multicast
];

// Listas SEPARADAS por família: o BlockList do Node também confere um IPv4
// contra as regras IPv6 (via ::ffff:a.b.c.d), e o bloqueio do bloco mapeado
// ::ffff:0:0/96 bloquearia todo IPv4 se as regras ficassem juntas.
const BLOCKED_IPV4 = new BlockList();
for (const [network, prefix] of BLOCKED_IPV4_SUBNETS) {
  BLOCKED_IPV4.addSubnet(network, prefix, "ipv4");
}
const BLOCKED_IPV6 = new BlockList();
for (const [network, prefix] of BLOCKED_IPV6_SUBNETS) {
  BLOCKED_IPV6.addSubnet(network, prefix, "ipv6");
}

/**
 * True se o IP NÃO pode ser destino de uma requisição do workflow. Qualquer
 * coisa que não seja um IP válido é bloqueada (fail-closed).
 */
export function isBlockedIpAddress(address: string): boolean {
  const normalized = address.trim().replace(/^\[/, "").replace(/\]$/, "");
  // Zone id (fe80::1%eth0) não muda a classificação do endereço.
  const withoutZone = normalized.split("%")[0];
  const family = isIP(withoutZone);
  if (family === 4) {
    return BLOCKED_IPV4.check(withoutZone, "ipv4");
  }
  if (family === 6) {
    return BLOCKED_IPV6.check(withoutZone, "ipv6");
  }
  return true;
}

function hostnameOf(url: URL): string {
  return url.hostname
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .replace(/\.$/, "")
    .toLowerCase();
}

function isLocalHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname.endsWith(".localhost");
}

function blockedDestinationError(hostname: string): SafeHttpError {
  return new SafeHttpError(
    "blocked_destination",
    `Destino bloqueado: "${hostname}" aponta para um endereço interno/privado`
  );
}

/** Valida e normaliza a URL: só http/https com host. */
export function parseHttpUrl(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(String(rawUrl).trim());
  } catch {
    throw new SafeHttpError("invalid_url", "URL inválida");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SafeHttpError(
      "blocked_scheme",
      `Esquema "${url.protocol.replace(/:$/, "")}" não permitido (use http ou https)`
    );
  }
  if (!url.hostname) {
    throw new SafeHttpError("invalid_url", "URL sem host");
  }
  return url;
}

const defaultResolver: AddressResolver = async (hostname) => {
  const results = await dnsLookup(hostname, { all: true, verbatim: true });
  return results.map((result) => ({
    address: result.address,
    family: result.family === 6 ? 6 : 4,
  }));
};

async function resolveAndCheck(
  hostname: string,
  resolver: AddressResolver,
  isBlocked: (address: string) => boolean
): Promise<ResolvedAddress[]> {
  let addresses: ResolvedAddress[];
  try {
    addresses = await resolver(hostname);
  } catch (error) {
    throw new SafeHttpError(
      "dns_failure",
      `Não foi possível resolver "${hostname}": ${error instanceof Error ? error.message : "erro de DNS"}`
    );
  }
  if (!Array.isArray(addresses) || addresses.length === 0) {
    throw new SafeHttpError("dns_failure", `Não foi possível resolver "${hostname}"`);
  }
  // TODOS os IPs precisam ser públicos: um único interno bloqueia o host.
  if (addresses.some((entry) => isBlocked(entry.address))) {
    throw blockedDestinationError(hostname);
  }
  return addresses;
}

/** Pré-checagem (mensagem clara + IP literal, que não passa pelo lookup). */
async function assertDestinationAllowed(
  url: URL,
  resolver: AddressResolver,
  isBlocked: (address: string) => boolean
): Promise<void> {
  const hostname = hostnameOf(url);
  if (isLocalHostname(hostname)) {
    throw blockedDestinationError(hostname);
  }
  if (isIP(hostname) !== 0) {
    if (isBlocked(hostname)) {
      throw blockedDestinationError(hostname);
    }
    return;
  }
  await resolveAndCheck(hostname, resolver, isBlocked);
}

/**
 * `lookup` da conexão: resolve e valida de novo no momento de conectar — o IP
 * validado é exatamente o IP usado pelo socket (anti DNS rebinding).
 */
function createGuardedLookup(
  resolver: AddressResolver,
  isBlocked: (address: string) => boolean
): LookupFunction {
  return (hostname, options, callback) => {
    resolveAndCheck(hostname, resolver, isBlocked)
      .then((addresses) => {
        const requested =
          options.family === 4 || options.family === "IPv4"
            ? 4
            : options.family === 6 || options.family === "IPv6"
              ? 6
              : 0;
        const usable = requested
          ? addresses.filter((entry) => entry.family === requested)
          : addresses;
        if (usable.length === 0) {
          throw new SafeHttpError("dns_failure", `Não foi possível resolver "${hostname}"`);
        }
        if (options.all) {
          callback(
            null,
            usable.map((entry) => ({ address: entry.address, family: entry.family }))
          );
        } else {
          callback(null, usable[0].address, usable[0].family);
        }
      })
      .catch((error: unknown) => {
        callback(error as NodeJS.ErrnoException, "", 0);
      });
  };
}

// ─── Requisição ──────────────────────────────────────────────────────────────

function normalizeMethod(method: string | undefined): string {
  const normalized = (method || "GET").trim().toUpperCase();
  if (!ALLOWED_METHODS.has(normalized)) {
    throw new SafeHttpError("invalid_method", `Método HTTP não permitido: "${method}"`);
  }
  return normalized;
}

function sanitizeRequestHeaders(
  input: Record<string, unknown> | undefined,
  hasBody: boolean
): Record<string, string> {
  const headers: Record<string, string> = {};
  if (input && typeof input === "object" && !Array.isArray(input)) {
    for (const [rawName, rawValue] of Object.entries(input)) {
      const name = rawName.trim().toLowerCase();
      if (!HEADER_NAME_PATTERN.test(name) || FORBIDDEN_REQUEST_HEADERS.has(name)) {
        continue;
      }
      if (
        typeof rawValue !== "string" &&
        typeof rawValue !== "number" &&
        typeof rawValue !== "boolean"
      ) {
        continue;
      }
      const value = String(rawValue);
      if (/[\r\n\0]/.test(value)) {
        continue;
      }
      headers[name] = value;
    }
  }
  // Defaults equivalentes aos do fetch.
  headers.accept ??= "*/*";
  headers["user-agent"] ??= "Dispara-Workflow/1.0";
  headers["accept-encoding"] ??= "gzip, deflate, br";
  if (hasBody) {
    headers["content-type"] ??= "text/plain;charset=UTF-8";
  }
  return headers;
}

function flattenHeaders(raw: http.IncomingHttpHeaders): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(raw)) {
    if (value === undefined) continue;
    headers[name] = Array.isArray(value) ? value.join(", ") : String(value);
  }
  return headers;
}

function timeoutError(timeoutMs: number): SafeHttpError {
  return new SafeHttpError("timeout", `Tempo limite de ${timeoutMs}ms excedido`);
}

function tooLargeError(maxBytes: number): SafeHttpError {
  return new SafeHttpError(
    "response_too_large",
    `Resposta excede o limite de ${maxBytes} bytes`
  );
}

function decodedStream(res: http.IncomingMessage): Readable {
  const encoding = String(res.headers["content-encoding"] ?? "")
    .trim()
    .toLowerCase();
  if (encoding === "gzip" || encoding === "x-gzip") {
    return res.pipe(zlib.createGunzip());
  }
  if (encoding === "deflate") {
    return res.pipe(zlib.createInflate());
  }
  if (encoding === "br") {
    return res.pipe(zlib.createBrotliDecompress());
  }
  return res;
}

type SendOnceInput = {
  url: URL;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
  deadline: number;
  timeoutMs: number;
  maxResponseBytes: number;
  lookup: LookupFunction;
};

type SendOnceResult = SafeHttpResponse & { redirectLocation?: string };

function sendOnce(input: SendOnceInput): Promise<SendOnceResult> {
  const remaining = input.deadline - Date.now();
  if (remaining <= 0) {
    return Promise.reject(timeoutError(input.timeoutMs));
  }
  const transport = input.url.protocol === "https:" ? https : http;
  const headers = { ...input.headers };
  if (input.body !== undefined) {
    headers["content-length"] = String(Buffer.byteLength(input.body));
  }

  return new Promise<SendOnceResult>((resolve, reject) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const settle = (action: () => void) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      action();
    };
    const fail = (error: unknown) =>
      settle(() =>
        reject(
          error instanceof SafeHttpError
            ? error
            : new SafeHttpError(
                "network_error",
                error instanceof Error ? error.message : "Falha de rede"
              )
        )
      );

    const req = transport.request(
      input.url,
      {
        method: input.method,
        headers,
        lookup: input.lookup,
        // Agent novo por requisição: nada de socket reaproveitado de outro host.
        agent: false,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const responseHeaders = flattenHeaders(res.headers);
        const base = {
          status,
          statusText: res.statusMessage ?? "",
          headers: responseHeaders,
          url: input.url.toString(),
        };

        const location = res.headers.location;
        if (REDIRECT_STATUSES.has(status) && typeof location === "string" && location) {
          res.resume(); // descarta o corpo do redirect
          settle(() =>
            resolve({ ...base, body: Buffer.alloc(0), redirectLocation: location })
          );
          return;
        }

        const declaredLength = Number(res.headers["content-length"]);
        if (Number.isFinite(declaredLength) && declaredLength > input.maxResponseBytes) {
          const error = tooLargeError(input.maxResponseBytes);
          req.destroy(error);
          fail(error);
          return;
        }

        let stream: Readable;
        try {
          stream = decodedStream(res);
        } catch (error) {
          req.destroy();
          fail(error);
          return;
        }

        const chunks: Buffer[] = [];
        let total = 0;
        stream.on("data", (chunk: Buffer) => {
          total += chunk.length;
          if (total > input.maxResponseBytes) {
            const error = tooLargeError(input.maxResponseBytes);
            stream.destroy();
            req.destroy(error);
            fail(error);
            return;
          }
          chunks.push(chunk);
        });
        stream.on("end", () =>
          settle(() => resolve({ ...base, body: Buffer.concat(chunks) }))
        );
        stream.on("error", fail);
        if (stream !== res) {
          res.on("error", fail);
        }
        res.on("close", () => {
          if (!res.complete) {
            fail(new SafeHttpError("network_error", "Conexão encerrada antes do fim da resposta"));
          }
        });
      }
    );

    timer = setTimeout(() => {
      const error = timeoutError(input.timeoutMs);
      req.destroy(error);
      fail(error);
    }, remaining);

    req.on("error", fail);
    if (input.body !== undefined) {
      req.write(input.body);
    }
    req.end();
  });
}

/**
 * Faz a requisição HTTP com as proteções anti-SSRF. Lança SafeHttpError em
 * destino/esquema bloqueado, timeout, excesso de redirects ou resposta grande
 * demais. Status HTTP de erro (4xx/5xx) NÃO lança: volta na resposta.
 */
export async function safeHttpRequest(
  rawUrl: string,
  options: SafeHttpRequestOptions = {}
): Promise<SafeHttpResponse> {
  const timeoutMs =
    options.timeoutMs && options.timeoutMs > 0
      ? options.timeoutMs
      : SAFE_HTTP_DEFAULT_TIMEOUT_MS;
  const maxResponseBytes =
    options.maxResponseBytes && options.maxResponseBytes > 0
      ? options.maxResponseBytes
      : SAFE_HTTP_DEFAULT_MAX_RESPONSE_BYTES;
  const maxRedirects =
    options.maxRedirects !== undefined && options.maxRedirects >= 0
      ? options.maxRedirects
      : SAFE_HTTP_DEFAULT_MAX_REDIRECTS;
  const resolver = options.resolver ?? defaultResolver;
  const isBlocked = options.isAddressBlocked ?? isBlockedIpAddress;
  const lookup = createGuardedLookup(resolver, isBlocked);
  const deadline = Date.now() + timeoutMs;

  let url = parseHttpUrl(rawUrl);
  let method = normalizeMethod(options.method);
  let body = method === "GET" || method === "HEAD" ? undefined : options.body;
  let headers = sanitizeRequestHeaders(options.headers, body !== undefined);

  for (let redirects = 0; ; redirects += 1) {
    await assertDestinationAllowed(url, resolver, isBlocked);
    const response = await sendOnce({
      url,
      method,
      headers,
      body,
      deadline,
      timeoutMs,
      maxResponseBytes,
      lookup,
    });

    const { redirectLocation, ...finalResponse } = response;
    if (!redirectLocation) {
      return finalResponse;
    }
    if (redirects >= maxRedirects) {
      throw new SafeHttpError(
        "too_many_redirects",
        `Excedido o limite de ${maxRedirects} redirecionamentos`
      );
    }

    let nextUrl: URL;
    try {
      nextUrl = new URL(redirectLocation, url);
    } catch {
      throw new SafeHttpError("invalid_url", "Redirecionamento para URL inválida");
    }
    nextUrl = parseHttpUrl(nextUrl.toString());

    // Mesma regra do fetch: 303 (e 301/302 de POST) viram GET sem corpo.
    if (
      (response.status === 303 && method !== "HEAD") ||
      ((response.status === 301 || response.status === 302) && method === "POST")
    ) {
      method = "GET";
      body = undefined;
      headers = { ...headers };
      delete headers["content-type"];
    }
    if (nextUrl.origin !== url.origin) {
      headers = { ...headers };
      for (const name of CROSS_ORIGIN_STRIPPED_HEADERS) {
        delete headers[name];
      }
    }
    url = nextUrl;
  }
}
