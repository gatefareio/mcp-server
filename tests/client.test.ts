import { describe, it, expect, vi, beforeEach } from "vitest";
import { GatefareClient } from "../src/client.js";
import { GatefareError } from "../src/types.js";
import { parseConfig } from "../src/config.js";

const mockConfig = parseConfig({
  GATEFARE_BASE_URL: "https://api.test.gatefare.io",
});

describe("GatefareClient.request", () => {
  let client: GatefareClient;

  beforeEach(() => {
    client = new GatefareClient(mockConfig);
    vi.restoreAllMocks();
  });

  it("makes GET requests with query params", async () => {
    const mockResponse = { apis: [], total: 0 };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(mockResponse), {
        headers: { "content-type": "application/json" },
      }),
    );

    const result = await client.request({
      path: "/api/catalog",
      query: { q: "weather", page: 1 },
    });

    expect(result).toEqual(mockResponse);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/catalog?q=weather&page=1"),
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("sends POST with JSON body and Content-Type header", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: 1 }), {
        headers: { "content-type": "application/json" },
      }),
    );

    await client.request({
      method: "POST",
      path: "/api/publisher/apis",
      body: { name: "test" },
    });

    const call = vi.mocked(fetch).mock.calls[0]!;
    expect(call[1]?.method).toBe("POST");
    expect(call[1]?.body).toBe('{"name":"test"}');
    expect((call[1]?.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/json",
    );
  });

  it("sends Authorization header when PAT is set", async () => {
    const patConfig = parseConfig({
      GATEFARE_BASE_URL: "https://api.test.gatefare.io",
      GATEFARE_PAT: "gfpat_test123",
    });
    const patClient = new GatefareClient(patConfig);

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify([]), {
        headers: { "content-type": "application/json" },
      }),
    );

    await patClient.request({ path: "/api/publisher/apis" });

    const headers = vi.mocked(fetch).mock.calls[0]![1]?.headers as Record<
      string,
      string
    >;
    expect(headers["Authorization"]).toBe("Bearer gfpat_test123");
  });

  describe("error mapping", () => {
    it("404 -> API_NOT_FOUND", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response("not found", { status: 404 }),
      );
      await expect(
        client.request({ path: "/api/catalog/missing" }),
      ).rejects.toMatchObject({ code: "API_NOT_FOUND" });
    });

    it("429 -> RATE_LIMITED", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response("too many", { status: 429 }),
      );
      await expect(client.request({ path: "/test" })).rejects.toMatchObject({
        code: "RATE_LIMITED",
      });
    });

    it("401 -> GATEFARE_API_ERROR", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response("unauthorized", { status: 401 }),
      );
      await expect(client.request({ path: "/test" })).rejects.toMatchObject({
        code: "GATEFARE_API_ERROR",
      });
    });

    it("403 -> GATEFARE_API_ERROR", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response("forbidden", { status: 403 }),
      );
      await expect(client.request({ path: "/test" })).rejects.toMatchObject({
        code: "GATEFARE_API_ERROR",
      });
    });

    it("400 -> GATEFARE_API_ERROR (no silent passthrough)", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify({ error: "bad request" }), {
          status: 400,
          headers: { "content-type": "application/json" },
        }),
      );
      await expect(client.request({ path: "/test" })).rejects.toThrow(
        GatefareError,
      );
    });

    it("500 -> GATEFARE_API_ERROR", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response("internal error", { status: 500 }),
      );
      await expect(client.request({ path: "/test" })).rejects.toMatchObject({
        code: "GATEFARE_API_ERROR",
      });
    });

    it("network failure -> NETWORK_ERROR", async () => {
      vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));
      await expect(client.request({ path: "/test" })).rejects.toMatchObject({
        code: "NETWORK_ERROR",
      });
    });

    it("402 also throws (request, not requestRaw)", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response("payment required", { status: 402 }),
      );
      await expect(client.request({ path: "/api/catalog/foo" })).rejects.toThrow(
        GatefareError,
      );
    });
  });

  it("omits undefined query params", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({}), {
        headers: { "content-type": "application/json" },
      }),
    );

    await client.request({
      path: "/api/catalog",
      query: { q: "test", category: undefined },
    });

    const url = vi.mocked(fetch).mock.calls[0]![0] as string;
    expect(url).not.toContain("category");
  });

  it("returns text for non-JSON responses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("plain text", {
        headers: { "content-type": "text/plain" },
      }),
    );
    const result = await client.request({ path: "/test" });
    expect(result).toBe("plain text");
  });
});

describe("GatefareClient.requestRaw", () => {
  let client: GatefareClient;

  beforeEach(() => {
    client = new GatefareClient(mockConfig);
    vi.restoreAllMocks();
  });

  it("does NOT throw on 402 (the caller handles it)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("{}", {
        status: 402,
        headers: { "content-type": "application/json" },
      }),
    );
    const r = await client.requestRaw("https://example.com/p/foo");
    expect(r.status).toBe(402);
  });

  it("does NOT throw on 4xx (the caller handles it)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("err", { status: 401 }),
    );
    const r = await client.requestRaw("https://example.com/p/foo");
    expect(r.status).toBe(401);
  });

  it("defaults Content-Type to JSON when body present", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("ok"));
    await client.requestRaw("https://example.com/p/foo", {
      method: "POST",
      body: '{"a":1}',
    });
    const headers = vi.mocked(fetch).mock.calls[0]![1]?.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("does not override caller-provided Content-Type", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("ok"));
    await client.requestRaw("https://example.com/p/foo", {
      method: "POST",
      headers: { "Content-Type": "text/csv" },
      body: "a,b,c",
    });
    const headers = vi.mocked(fetch).mock.calls[0]![1]?.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("text/csv");
  });

  it("throws NETWORK_ERROR on fetch failure", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));
    await expect(
      client.requestRaw("https://example.com/p/foo"),
    ).rejects.toMatchObject({ code: "NETWORK_ERROR" });
  });
});
