// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

// server-only barra a importação em ambiente de teste; neutraliza.
vi.mock("server-only", () => ({}));

type SafeHttpModule = typeof import("@/lib/builder/utils/safe-http");

const safeHttpRequestMock = vi.hoisted(() =>
  vi.fn<SafeHttpModule["safeHttpRequest"]>()
);

vi.mock("@/lib/builder/utils/safe-http", async (importOriginal) => {
  const actual = await importOriginal<SafeHttpModule>();
  return {
    ...actual,
    safeHttpRequest: (...args: Parameters<SafeHttpModule["safeHttpRequest"]>) =>
      safeHttpRequestMock(...args),
  };
});

import { httpRequestStep } from "./http-request";

beforeEach(async () => {
  const actual = await vi.importActual<SafeHttpModule>("@/lib/builder/utils/safe-http");
  safeHttpRequestMock.mockReset();
  // Por padrão usa a implementação REAL (com o guard anti-SSRF).
  safeHttpRequestMock.mockImplementation(actual.safeHttpRequest);
});

function response(status: number, body: string, contentType?: string) {
  return {
    status,
    statusText: "",
    headers: contentType ? { "content-type": contentType } : {},
    body: Buffer.from(body, "utf8"),
    url: "https://api.example.com/x",
  };
}

describe("httpRequestStep — SSRF", () => {
  const blocked = [
    "http://169.254.169.254/latest/meta-data/iam/security-credentials/",
    "http://127.0.0.1:3000/api/settings",
    "http://[::1]/",
    "http://10.0.0.1/",
    "http://localhost:3000/",
  ];
  for (const endpoint of blocked) {
    it(`bloqueia ${endpoint}`, async () => {
      const result = await httpRequestStep({ endpoint, httpMethod: "GET" });
      expect(result.success).toBe(false);
      expect((result as { error: string }).error).toContain("Destino bloqueado");
    });
  }

  it("bloqueia esquema file://", async () => {
    const result = await httpRequestStep({ endpoint: "file:///etc/passwd", httpMethod: "GET" });
    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toContain("não permitido");
  });
});

describe("httpRequestStep — comportamento preservado", () => {
  it("parseia JSON quando content-type é application/json", async () => {
    safeHttpRequestMock.mockResolvedValueOnce(response(200, '{"a":1}', "application/json; charset=utf-8"));
    const result = await httpRequestStep({ endpoint: "https://api.example.com/x", httpMethod: "GET" });
    expect(result).toEqual({ success: true, data: { a: 1 }, status: 200 });
  });

  it("devolve texto para outros content-types", async () => {
    safeHttpRequestMock.mockResolvedValueOnce(response(201, "ok", "text/plain"));
    const result = await httpRequestStep({ endpoint: "https://api.example.com/x", httpMethod: "POST" });
    expect(result).toEqual({ success: true, data: "ok", status: 201 });
  });

  it("status não-2xx vira erro com o corpo", async () => {
    safeHttpRequestMock.mockResolvedValueOnce(response(404, "não achei", "text/plain"));
    const result = await httpRequestStep({ endpoint: "https://api.example.com/x", httpMethod: "GET" });
    expect(result).toEqual({
      success: false,
      error: "HTTP request failed with status 404: não achei",
      status: 404,
    });
  });

  it("repassa método, headers, corpo e timeout (limitado) ao cliente seguro", async () => {
    safeHttpRequestMock.mockResolvedValueOnce(response(200, "{}", "application/json"));
    await httpRequestStep({
      endpoint: "https://api.example.com/x",
      httpMethod: "post",
      httpHeaders: '{"Authorization":"Bearer t"}',
      httpBody: '{"a":1}',
      timeoutMs: 999_999,
    });
    const [url, options] = safeHttpRequestMock.mock.calls[0];
    expect(url).toBe("https://api.example.com/x");
    expect(options?.method).toBe("POST");
    expect(options?.headers).toEqual({ Authorization: "Bearer t" });
    expect(options?.body).toBe('{"a":1}');
    expect(options?.timeoutMs).toBe(60_000);
  });

  it("GET não envia corpo e headers inválidos viram {}", async () => {
    safeHttpRequestMock.mockResolvedValueOnce(response(200, "x", "text/plain"));
    await httpRequestStep({
      endpoint: "https://api.example.com/x",
      httpMethod: "GET",
      httpHeaders: "não é json",
      httpBody: '{"a":1}',
    });
    const [, options] = safeHttpRequestMock.mock.calls[0];
    expect(options?.body).toBeUndefined();
    expect(options?.headers).toEqual({});
  });

  it("URL vazia continua com a mensagem antiga", async () => {
    const result = await httpRequestStep({ endpoint: "", httpMethod: "GET" });
    expect(result).toEqual({ success: false, error: "HTTP request failed: URL is required" });
    expect(safeHttpRequestMock).not.toHaveBeenCalled();
  });
});
