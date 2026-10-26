// @vitest-environment node
import http from "node:http";
import type { AddressInfo } from "node:net";
import zlib from "node:zlib";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  isBlockedIpAddress,
  parseHttpUrl,
  type ResolvedAddress,
  safeHttpRequest,
  SafeHttpError,
} from "@/lib/builder/utils/safe-http";

// ─── Classificação de IPs ────────────────────────────────────────────────────

describe("isBlockedIpAddress", () => {
  const blocked = [
    "127.0.0.1",
    "127.255.255.254",
    "10.0.0.1",
    "10.255.255.255",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.0.1",
    "192.168.255.255",
    "100.64.0.1",
    "100.127.255.255",
    "169.254.169.254",
    "169.254.0.1",
    "0.0.0.0",
    "0.1.2.3",
    "224.0.0.1",
    "239.255.255.250",
    "255.255.255.255",
    "240.0.0.1",
    "198.18.0.1",
    "192.0.2.10",
    "::1",
    "::",
    "[::1]",
    "fd00::1",
    "fd00:ec2::254",
    "fc00::1",
    "fe80::1",
    "fe80::1%eth0",
    "fec0::1",
    "ff02::1",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "::ffff:169.254.169.254",
    "::ffff:10.0.0.1",
    "::127.0.0.1",
    "64:ff9b::a9fe:a9fe",
    "2002:7f00:1::1",
    "2001:db8::1",
    "2001::1",
    "100::1",
    // não-IP → fail-closed
    "localhost",
    "not-an-ip",
    "",
    "999.1.1.1",
  ];
  const allowed = [
    "8.8.8.8",
    "1.1.1.1",
    "93.184.216.34",
    "172.15.255.255",
    "172.32.0.1",
    "100.63.255.255",
    "100.128.0.1",
    "169.255.0.1",
    "192.169.0.1",
    "11.0.0.1",
    "2606:4700:4700::1111",
    "2001:4860:4860::8888",
    "2a03:2880:f12f:83:face:b00c::25de",
  ];

  for (const ip of blocked) {
    it(`bloqueia ${ip || "(vazio)"}`, () => {
      expect(isBlockedIpAddress(ip)).toBe(true);
    });
  }
  for (const ip of allowed) {
    it(`permite ${ip}`, () => {
      expect(isBlockedIpAddress(ip)).toBe(false);
    });
  }
});

describe("parseHttpUrl", () => {
  const blockedSchemes = [
    "file:///etc/passwd",
    "ftp://example.com/x",
    "gopher://127.0.0.1:6379/_PING",
    "data:text/plain,oi",
    "javascript:alert(1)",
    "ws://example.com/socket",
    "dict://127.0.0.1:11211/",
  ];
  for (const url of blockedSchemes) {
    it(`rejeita esquema: ${url}`, () => {
      expect(() => parseHttpUrl(url)).toThrow(SafeHttpError);
      try {
        parseHttpUrl(url);
      } catch (error) {
        expect((error as SafeHttpError).code).toBe("blocked_scheme");
      }
    });
  }

  it("rejeita URL inválida", () => {
    expect(() => parseHttpUrl("isso não é url")).toThrow(SafeHttpError);
  });

  it("aceita http e https", () => {
    expect(parseHttpUrl("https://api.example.com/x").hostname).toBe("api.example.com");
    expect(parseHttpUrl("http://api.example.com/x").protocol).toBe("http:");
  });
});

// ─── safeHttpRequest com DNS mockado ─────────────────────────────────────────

type HostTable = Record<string, ResolvedAddress[] | (() => ResolvedAddress[])>;

function makeResolver(table: HostTable) {
  const calls: string[] = [];
  const resolver = async (hostname: string): Promise<ResolvedAddress[]> => {
    calls.push(hostname);
    const entry = table[hostname];
    if (!entry) {
      throw Object.assign(new Error(`getaddrinfo ENOTFOUND ${hostname}`), {
        code: "ENOTFOUND",
      });
    }
    return typeof entry === "function" ? entry() : entry;
  };
  return { resolver, calls };
}

async function expectSafeHttpError(
  promise: Promise<unknown>,
  code: SafeHttpError["code"]
): Promise<SafeHttpError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(SafeHttpError);
    expect((error as SafeHttpError).code).toBe(code);
    return error as SafeHttpError;
  }
  throw new Error("esperava SafeHttpError");
}

describe("safeHttpRequest — destinos bloqueados (sem rede)", () => {
  // Resolver que falharia o teste se fosse chamado com rede real.
  const { resolver } = makeResolver({
    "public.example.test": [{ address: "93.184.216.34", family: 4 }],
    "internal.example.test": [{ address: "10.0.0.5", family: 4 }],
    "metadata.example.test": [{ address: "169.254.169.254", family: 4 }],
    "v6-loopback.example.test": [{ address: "::1", family: 6 }],
    "mixed.example.test": [
      { address: "93.184.216.34", family: 4 },
      { address: "192.168.1.10", family: 4 },
    ],
    "mixed-v6.example.test": [
      { address: "2606:4700:4700::1111", family: 6 },
      { address: "fd00::1", family: 6 },
    ],
    "empty.example.test": [],
    "localhost": [{ address: "93.184.216.34", family: 4 }],
  });

  const literalUrls = [
    "http://127.0.0.1/",
    "http://127.0.0.1:3000/api/settings",
    "http://169.254.169.254/latest/meta-data/iam/security-credentials/",
    "http://[::1]:8080/",
    "http://[::ffff:127.0.0.1]/",
    "http://[fd00:ec2::254]/latest/meta-data/",
    "http://0.0.0.0/",
    "http://0/",
    "http://2130706433/", // 127.0.0.1 em decimal
    "http://0x7f.0.0.1/", // 127.0.0.1 em hex
    "http://017700000001/", // 127.0.0.1 em octal
    "http://10.1.2.3/",
    "http://172.16.5.4/",
    "http://192.168.0.1/",
    "http://100.64.0.1/",
    "https://127.0.0.1/",
  ];
  for (const url of literalUrls) {
    it(`bloqueia IP literal: ${url}`, async () => {
      await expectSafeHttpError(safeHttpRequest(url, { resolver }), "blocked_destination");
    });
  }

  const hostnameUrls = [
    "http://internal.example.test/",
    "http://metadata.example.test/latest/meta-data/",
    "http://v6-loopback.example.test/",
    "http://mixed.example.test/", // 1 IP público + 1 privado → bloqueia
    "http://mixed-v6.example.test/",
    "http://localhost/", // nome local, mesmo que o DNS "diga" público
    "http://app.localhost/",
  ];
  for (const url of hostnameUrls) {
    it(`bloqueia host que resolve para IP interno: ${url}`, async () => {
      await expectSafeHttpError(safeHttpRequest(url, { resolver }), "blocked_destination");
    });
  }

  it("falha fechado quando o DNS não resolve ou volta vazio", async () => {
    await expectSafeHttpError(
      safeHttpRequest("http://nao-existe.example.test/", { resolver }),
      "dns_failure"
    );
    await expectSafeHttpError(
      safeHttpRequest("http://empty.example.test/", { resolver }),
      "dns_failure"
    );
  });

  it("rejeita esquemas não-http antes de qualquer resolução", async () => {
    await expectSafeHttpError(
      safeHttpRequest("file:///etc/passwd", { resolver }),
      "blocked_scheme"
    );
    await expectSafeHttpError(
      safeHttpRequest("gopher://public.example.test/", { resolver }),
      "blocked_scheme"
    );
  });

  it("rejeita método fora da lista", async () => {
    await expectSafeHttpError(
      safeHttpRequest("http://public.example.test/", { resolver, method: "CONNECT" }),
      "invalid_method"
    );
  });
});

// ─── safeHttpRequest contra um servidor local ────────────────────────────────
// O servidor escuta em 127.0.0.1. A política injetada libera SÓ 127.0.0.1
// (o resto segue a política real), e o DNS é mockado: nomes *.example.test
// apontam para o servidor local ou para IPs internos.

type Received = { method: string; url: string; headers: http.IncomingHttpHeaders; body: string };

let server: http.Server;
let port = 0;
const received: Received[] = [];

const testPolicy = (address: string) => address !== "127.0.0.1" && isBlockedIpAddress(address);

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      received.push({ method: req.method ?? "", url: req.url ?? "", headers: req.headers, body });
      const path = req.url ?? "/";
      if (path === "/json") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      } else if (path === "/echo") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ method: req.method, headers: req.headers, body }));
      } else if (path === "/redirect-same") {
        res.writeHead(302, { location: "/json" });
        res.end();
      } else if (path === "/redirect-internal") {
        res.writeHead(302, { location: "http://internal.example.test/secret" });
        res.end();
      } else if (path === "/redirect-literal") {
        res.writeHead(301, { location: "http://169.254.169.254/latest/meta-data/" });
        res.end();
      } else if (path === "/redirect-file") {
        res.writeHead(302, { location: "file:///etc/passwd" });
        res.end();
      } else if (path === "/redirect-loop") {
        res.writeHead(302, { location: "/redirect-loop" });
        res.end();
      } else if (path === "/see-other") {
        res.writeHead(303, { location: "/echo" });
        res.end();
      } else if (path === "/redirect-cross") {
        res.writeHead(307, { location: `http://other.example.test:${port}/echo` });
        res.end();
      } else if (path === "/redirect-same-origin-echo") {
        res.writeHead(307, { location: "/echo" });
        res.end();
      } else if (path === "/big-declared") {
        const payload = "x".repeat(5000);
        res.writeHead(200, { "content-type": "text/plain", "content-length": String(payload.length) });
        res.end(payload);
      } else if (path === "/big-chunked") {
        res.writeHead(200, { "content-type": "text/plain" });
        for (let i = 0; i < 10; i += 1) res.write("y".repeat(500));
        res.end();
      } else if (path === "/gzip") {
        res.writeHead(200, { "content-type": "application/json", "content-encoding": "gzip" });
        res.end(zlib.gzipSync(JSON.stringify({ zipped: true })));
      } else if (path === "/gzip-bomb") {
        res.writeHead(200, { "content-type": "text/plain", "content-encoding": "gzip" });
        res.end(zlib.gzipSync(Buffer.alloc(1024 * 1024, 0x61)));
      } else if (path === "/hang") {
        // nunca responde
      } else if (path === "/status-500") {
        res.writeHead(500, { "content-type": "text/plain" });
        res.end("falhou");
      } else {
        res.writeHead(404);
        res.end("not found");
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  received.length = 0;
});

function localResolver(extra: HostTable = {}) {
  return makeResolver({
    "api.example.test": [{ address: "127.0.0.1", family: 4 }],
    "other.example.test": [{ address: "127.0.0.1", family: 4 }],
    "internal.example.test": [{ address: "10.0.0.5", family: 4 }],
    ...extra,
  });
}

function base(path: string): string {
  return `http://api.example.test:${port}${path}`;
}

describe("safeHttpRequest — servidor local (DNS mockado)", () => {
  it("a política PADRÃO bloqueia o próprio servidor local (127.0.0.1)", async () => {
    await expectSafeHttpError(
      safeHttpRequest(`http://127.0.0.1:${port}/json`),
      "blocked_destination"
    );
    const { resolver } = localResolver();
    await expectSafeHttpError(
      safeHttpRequest(base("/json"), { resolver }),
      "blocked_destination"
    );
    expect(received).toHaveLength(0);
  });

  it("GET simples com JSON", async () => {
    const { resolver } = localResolver();
    const res = await safeHttpRequest(base("/json"), { resolver, isAddressBlocked: testPolicy });
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body.toString("utf8"))).toEqual({ ok: true });
  });

  it("POST envia corpo e cabeçalhos do usuário, mas não deixa sobrescrever host/content-length", async () => {
    const { resolver } = localResolver();
    const res = await safeHttpRequest(base("/echo"), {
      resolver,
      isAddressBlocked: testPolicy,
      method: "post",
      headers: { "Content-Type": "application/json", "X-Custom": "1", Host: "evil.internal", "Content-Length": "999" },
      body: '{"a":1}',
    });
    const echoed = JSON.parse(res.body.toString("utf8")) as {
      method: string;
      headers: Record<string, string>;
      body: string;
    };
    expect(echoed.method).toBe("POST");
    expect(echoed.body).toBe('{"a":1}');
    expect(echoed.headers["x-custom"]).toBe("1");
    expect(echoed.headers["content-type"]).toBe("application/json");
    expect(echoed.headers.host).toBe(`api.example.test:${port}`);
    expect(echoed.headers["content-length"]).toBe("7");
  });

  it("status de erro volta na resposta (não lança)", async () => {
    const { resolver } = localResolver();
    const res = await safeHttpRequest(base("/status-500"), { resolver, isAddressBlocked: testPolicy });
    expect(res.status).toBe(500);
    expect(res.body.toString("utf8")).toBe("falhou");
  });

  it("segue redirect para o mesmo host (revalidado)", async () => {
    const { resolver } = localResolver();
    const res = await safeHttpRequest(base("/redirect-same"), { resolver, isAddressBlocked: testPolicy });
    expect(res.status).toBe(200);
    expect(res.url).toBe(base("/json"));
  });

  it("bloqueia redirect para host interno", async () => {
    const { resolver } = localResolver();
    await expectSafeHttpError(
      safeHttpRequest(base("/redirect-internal"), { resolver, isAddressBlocked: testPolicy }),
      "blocked_destination"
    );
  });

  it("bloqueia redirect para IP de metadata", async () => {
    const { resolver } = localResolver();
    await expectSafeHttpError(
      safeHttpRequest(base("/redirect-literal"), { resolver, isAddressBlocked: testPolicy }),
      "blocked_destination"
    );
  });

  it("bloqueia redirect para esquema não-http", async () => {
    const { resolver } = localResolver();
    await expectSafeHttpError(
      safeHttpRequest(base("/redirect-file"), { resolver, isAddressBlocked: testPolicy }),
      "blocked_scheme"
    );
  });

  it("limita a quantidade de redirects", async () => {
    const { resolver } = localResolver();
    await expectSafeHttpError(
      safeHttpRequest(base("/redirect-loop"), { resolver, isAddressBlocked: testPolicy, maxRedirects: 3 }),
      "too_many_redirects"
    );
    expect(received).toHaveLength(4);
  });

  it("303 transforma POST em GET sem corpo", async () => {
    const { resolver } = localResolver();
    const res = await safeHttpRequest(base("/see-other"), {
      resolver,
      isAddressBlocked: testPolicy,
      method: "POST",
      body: "dados",
    });
    const echoed = JSON.parse(res.body.toString("utf8")) as { method: string; body: string };
    expect(echoed.method).toBe("GET");
    expect(echoed.body).toBe("");
  });

  it("redirect cross-origin remove Authorization/Cookie; same-origin mantém", async () => {
    const { resolver } = localResolver();
    const headers = { Authorization: "Bearer segredo", Cookie: "a=b", "X-Keep": "1" };
    const cross = await safeHttpRequest(base("/redirect-cross"), {
      resolver,
      isAddressBlocked: testPolicy,
      headers,
    });
    const crossEcho = JSON.parse(cross.body.toString("utf8")) as { headers: Record<string, string> };
    expect(crossEcho.headers.authorization).toBeUndefined();
    expect(crossEcho.headers.cookie).toBeUndefined();
    expect(crossEcho.headers["x-keep"]).toBe("1");

    const same = await safeHttpRequest(base("/redirect-same-origin-echo"), {
      resolver,
      isAddressBlocked: testPolicy,
      headers,
    });
    const sameEcho = JSON.parse(same.body.toString("utf8")) as { headers: Record<string, string> };
    expect(sameEcho.headers.authorization).toBe("Bearer segredo");
  });

  it("DNS rebinding: IP muda entre a checagem e a conexão → bloqueado na conexão", async () => {
    let call = 0;
    const { resolver, calls } = localResolver({
      "rebind.example.test": () => {
        call += 1;
        // 1ª resolução (pré-checagem) devolve o servidor "público"; a 2ª, feita
        // pelo lookup da própria conexão, devolve um IP interno.
        return call === 1
          ? [{ address: "127.0.0.1", family: 4 }]
          : [{ address: "10.0.0.5", family: 4 }];
      },
    });
    await expectSafeHttpError(
      safeHttpRequest(`http://rebind.example.test:${port}/json`, {
        resolver,
        isAddressBlocked: testPolicy,
      }),
      "blocked_destination"
    );
    expect(calls.filter((h) => h === "rebind.example.test").length).toBeGreaterThanOrEqual(2);
    expect(received).toHaveLength(0);
  });

  it("limita o tamanho da resposta (content-length declarado)", async () => {
    const { resolver } = localResolver();
    await expectSafeHttpError(
      safeHttpRequest(base("/big-declared"), { resolver, isAddressBlocked: testPolicy, maxResponseBytes: 1000 }),
      "response_too_large"
    );
  });

  it("limita o tamanho da resposta (chunked, sem content-length)", async () => {
    const { resolver } = localResolver();
    await expectSafeHttpError(
      safeHttpRequest(base("/big-chunked"), { resolver, isAddressBlocked: testPolicy, maxResponseBytes: 1000 }),
      "response_too_large"
    );
  });

  it("descompacta gzip", async () => {
    const { resolver } = localResolver();
    const res = await safeHttpRequest(base("/gzip"), { resolver, isAddressBlocked: testPolicy });
    expect(JSON.parse(res.body.toString("utf8"))).toEqual({ zipped: true });
  });

  it("limite de tamanho vale DEPOIS da descompressão (gzip bomb)", async () => {
    const { resolver } = localResolver();
    await expectSafeHttpError(
      safeHttpRequest(base("/gzip-bomb"), { resolver, isAddressBlocked: testPolicy, maxResponseBytes: 64 * 1024 }),
      "response_too_large"
    );
  });

  it("aplica timeout", async () => {
    const { resolver } = localResolver();
    const started = Date.now();
    await expectSafeHttpError(
      safeHttpRequest(base("/hang"), { resolver, isAddressBlocked: testPolicy, timeoutMs: 200 }),
      "timeout"
    );
    expect(Date.now() - started).toBeLessThan(5000);
  });
});
