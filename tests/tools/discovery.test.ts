import { describe, it, expect, vi, beforeEach } from "vitest";
import { GatefareClient } from "../../src/client.js";
import { parseConfig } from "../../src/config.js";
import { registerDiscoveryTools, getApiSchema, suggestSchema } from "../../src/tools/discovery.js";

const config = parseConfig({ GATEFARE_BASE_URL: "https://test.gatefare.io" });

describe("discovery tools", () => {
  let client: GatefareClient;
  let tools: ReturnType<typeof registerDiscoveryTools>;

  beforeEach(() => {
    client = new GatefareClient(config);
    vi.spyOn(client, "request").mockResolvedValue({});
    tools = registerDiscoveryTools(client);
  });

  describe("search_apis", () => {
    it("calls /api/catalog with query params", async () => {
      await tools["gatefare.search_apis"].handler({
        query: "weather",
        max_price: 0.05,
        category: "data",
        sort: "popular",
        page: 2,
      });

      expect(client.request).toHaveBeenCalledWith({
        path: "/api/catalog",
        query: {
          q: "weather",
          category: "data",
          price_max: 0.05,
          sort: "popular",
          page: 2,
          includeTestnet: undefined,
        },
      });
    });

    it("handles empty params", async () => {
      await tools["gatefare.search_apis"].handler({});
      expect(client.request).toHaveBeenCalledWith({
        path: "/api/catalog",
        query: expect.objectContaining({ q: undefined }),
      });
    });
  });

  describe("get_api", () => {
    it("uses slug path with URL encoding", async () => {
      await tools["gatefare.get_api"].handler({ slug: "demo-weather" });
      expect(client.request).toHaveBeenCalledWith({
        path: "/api/catalog/demo-weather",
      });
    });

    it("uses handle/urlName path with URL encoding", async () => {
      await tools["gatefare.get_api"].handler({
        handle: "alice",
        urlName: "weather",
      });
      expect(client.request).toHaveBeenCalledWith({
        path: "/api/catalog/alice/weather",
      });
    });
  });

  describe("list_categories", () => {
    it("calls /api/catalog/categories", async () => {
      await tools["gatefare.list_categories"].handler();
      expect(client.request).toHaveBeenCalledWith({
        path: "/api/catalog/categories",
      });
    });
  });

  describe("suggest", () => {
    it("calls suggest endpoint with query", async () => {
      await tools["gatefare.suggest"].handler({ query: "wea" });
      expect(client.request).toHaveBeenCalledWith({
        path: "/api/catalog/search/suggest",
        query: { q: "wea" },
      });
    });
  });

  describe("annotations", () => {
    it("all discovery tools are read-only and idempotent", () => {
      for (const name of [
        "gatefare.search_apis",
        "gatefare.get_api",
        "gatefare.list_categories",
        "gatefare.suggest",
      ] as const) {
        expect(tools[name].annotations).toMatchObject({
          readOnlyHint: true,
          idempotentHint: true,
          openWorldHint: true,
        });
      }
    });
  });
});

describe("discovery schemas", () => {
  it("get_api requires slug or (handle+urlName)", () => {
    expect(() => getApiSchema.parse({})).toThrow();
    expect(() => getApiSchema.parse({ handle: "alice" })).toThrow(); // missing urlName
    expect(getApiSchema.parse({ slug: "demo" })).toBeDefined();
    expect(getApiSchema.parse({ handle: "alice", urlName: "weather" })).toBeDefined();
  });

  it("get_api rejects slug with slashes", () => {
    expect(() => getApiSchema.parse({ slug: "../admin" })).toThrow();
    expect(() => getApiSchema.parse({ slug: "foo/bar" })).toThrow();
  });

  it("suggest requires non-empty query", () => {
    expect(() => suggestSchema.parse({ query: "" })).toThrow();
    expect(suggestSchema.parse({ query: "w" })).toBeDefined();
  });
});
