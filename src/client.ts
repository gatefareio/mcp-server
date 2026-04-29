import { GatefareError, type ErrorCode } from "./types.js";
import type { Config } from "./config.js";

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  headers?: Record<string, string>;
  pat?: string | null;
}

const PACKAGE_USER_AGENT = "@gatefare/mcp/1.0.0";

export class GatefareClient {
  constructor(private config: Config) {}

  async request<T>(options: RequestOptions): Promise<T> {
    const url = new URL(options.path, this.config.baseUrl);

    if (options.query) {
      for (const [key, value] of Object.entries(options.query)) {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    const headers: Record<string, string> = {
      Accept: "application/json",
      "User-Agent": PACKAGE_USER_AGENT,
      ...options.headers,
    };

    const pat = options.pat ?? this.config.pat;
    if (pat) headers["Authorization"] = `Bearer ${pat}`;

    if (options.body !== undefined) headers["Content-Type"] = "application/json";

    let response: Response;
    try {
      response = await fetch(url.toString(), {
        method: options.method ?? "GET",
        headers,
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      });
    } catch (err) {
      throw new GatefareError(
        "NETWORK_ERROR",
        `Failed to connect to ${url.origin}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // Map specific HTTP statuses to stable error codes. The catalog/publisher
    // endpoints (the only callers of this method) never legitimately return
    // 402 — that's only the proxy. So treat 402 here as an error too.
    if (!response.ok) {
      const code = httpStatusToCode(response.status);
      const text = await response.text().catch(() => "");
      throw new GatefareError(
        code,
        `Gatefare API returned ${response.status}${text ? `: ${text.slice(0, 300)}` : ""}`,
        { status: response.status, path: options.path },
      );
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      return (await response.json()) as T;
    }
    return (await response.text()) as unknown as T;
  }

  /**
   * Lower-level fetch used by the x402 payment flow. Does NOT throw on
   * non-2xx — the caller (executePaymentFlow) needs to inspect 402 and
   * decide whether to sign + retry.
   */
  async requestRaw(
    url: string,
    options: {
      method?: string;
      headers?: Record<string, string>;
      body?: string;
    } = {},
  ): Promise<Response> {
    const headers: Record<string, string> = {
      "User-Agent": PACKAGE_USER_AGENT,
      ...options.headers,
    };

    // Default Content-Type for any request that carries a body. Callers
    // can override by setting Content-Type in options.headers.
    if (options.body !== undefined && !hasHeader(headers, "content-type")) {
      headers["Content-Type"] = "application/json";
    }

    try {
      return await fetch(url, {
        method: options.method ?? "GET",
        headers,
        body: options.body,
      });
    } catch (err) {
      throw new GatefareError(
        "NETWORK_ERROR",
        `Failed to connect: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

function httpStatusToCode(status: number): ErrorCode {
  if (status === 404) return "API_NOT_FOUND";
  if (status === 429) return "RATE_LIMITED";
  if (status === 401 || status === 403) return "GATEFARE_API_ERROR";
  if (status >= 500) return "GATEFARE_API_ERROR";
  return "GATEFARE_API_ERROR";
}

function hasHeader(headers: Record<string, string>, name: string): boolean {
  const target = name.toLowerCase();
  return Object.keys(headers).some((k) => k.toLowerCase() === target);
}
