/**
 * Executable step function for HTTP Request action
 */
import "server-only";

import { safeHttpRequest } from "@/lib/builder/utils/safe-http";
import { getErrorMessage } from "../utils";
import { type StepInput, withStepLogging } from "./step-handler";

type HttpRequestResult =
  | { success: true; data: unknown; status: number }
  | { success: false; error: string; status?: number };

export type HttpRequestInput = StepInput & {
  endpoint: string;
  httpMethod: string;
  httpHeaders?: string;
  httpBody?: string;
  /** Timeout do passo (config do nó); limitado a HTTP_REQUEST_MAX_TIMEOUT_MS. */
  timeoutMs?: number | string;
};

const HTTP_REQUEST_DEFAULT_TIMEOUT_MS = 15_000;
const HTTP_REQUEST_MAX_TIMEOUT_MS = 60_000;

function resolveTimeoutMs(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return HTTP_REQUEST_DEFAULT_TIMEOUT_MS;
  }
  return Math.min(parsed, HTTP_REQUEST_MAX_TIMEOUT_MS);
}

function parseHeaders(httpHeaders?: string): Record<string, unknown> {
  if (!httpHeaders) {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(httpHeaders);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function parseBody(httpMethod: string, httpBody?: string): string | undefined {
  if (httpMethod === "GET" || httpMethod === "HEAD" || !httpBody) {
    return;
  }
  try {
    const parsedBody = JSON.parse(httpBody);
    return Object.keys(parsedBody).length > 0
      ? JSON.stringify(parsedBody)
      : undefined;
  } catch {
    const trimmed = httpBody.trim();
    return trimmed && trimmed !== "{}" ? httpBody : undefined;
  }
}

function parseResponse(contentType: string | undefined, body: Buffer): unknown {
  const text = body.toString("utf8");
  if (contentType?.includes("application/json")) {
    return JSON.parse(text);
  }
  return text;
}

/**
 * HTTP request logic
 *
 * Segurança (SSRF): a requisição sai por safeHttpRequest — só http/https,
 * destino resolvido e validado (nada de IP privado/loopback/link-local/
 * metadata), redirects revalidados a cada salto, timeout e limite de tamanho.
 */
async function httpRequest(
  input: HttpRequestInput
): Promise<HttpRequestResult> {
  if (!input.endpoint) {
    return {
      success: false,
      error: "HTTP request failed: URL is required",
    };
  }

  try {
    const method = String(input.httpMethod || "GET").trim().toUpperCase();
    const response = await safeHttpRequest(input.endpoint, {
      method,
      headers: parseHeaders(input.httpHeaders),
      body: parseBody(method, input.httpBody),
      timeoutMs: resolveTimeoutMs(input.timeoutMs),
    });

    if (response.status < 200 || response.status > 299) {
      const errorText = response.body.toString("utf8");
      return {
        success: false,
        error: `HTTP request failed with status ${response.status}: ${errorText}`,
        status: response.status,
      };
    }

    const data = parseResponse(response.headers["content-type"], response.body);
    return { success: true, data, status: response.status };
  } catch (error) {
    return {
      success: false,
      error: `HTTP request failed: ${getErrorMessage(error)}`,
    };
  }
}

/**
 * HTTP Request Step
 * Makes an HTTP request to an endpoint
 */
// biome-ignore lint/suspicious/useAwait: workflow "use step" requires async
export async function httpRequestStep(
  input: HttpRequestInput
): Promise<HttpRequestResult> {
  "use step";
  return withStepLogging(input, () => httpRequest(input));
}
httpRequestStep.maxRetries = 0;
