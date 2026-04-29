import { describe, it, expect, vi, beforeEach } from "vitest";
import { GatefareClient } from "../../src/client.js";
import { parseConfig } from "../../src/config.js";
import {
  registerPublisherTools,
  registerApiSchema,
  updateApiSchema,
} from "../../src/tools/publisher.js";

describe("publisher tools", () => {
  const config = parseConfig({
    GATEFARE_BASE_URL: "https://test.gatefare.io",
    GATEFARE_PAT: "gfpat_test",
  });

  let client: GatefareClient;
  let tools: ReturnType<typeof registerPublisherTools>;

  beforeEach(() => {
    client = new GatefareClient(config);
    vi.spyOn(client, "request").mockResolvedValue({});
    tools = registerPublisherTools(client, config);
  });

  describe("register_api", () => {
    it("posts to /api/publisher/apis", async () => {
      const input = {
        urlName: "my-api",
        name: "My API",
        targetUrl: "https://example.com/api",
        price: "0.001",
        ownerWallet: "0x1234567890123456789012345678901234567890",
      };

      await tools["gatefare.register_api"].handler(input);
      expect(client.request).toHaveBeenCalledWith({
        method: "POST",
        path: "/api/publisher/apis",
        body: input,
      });
    });
  });

  describe("list_my_apis", () => {
    it("calls /api/publisher/apis", async () => {
      await tools["gatefare.list_my_apis"].handler();
      expect(client.request).toHaveBeenCalledWith({
        path: "/api/publisher/apis",
      });
    });
  });

  describe("update_api", () => {
    it("patches with changes", async () => {
      await tools["gatefare.update_api"].handler({
        slug: "my-api",
        changes: { price: "0.002", description: "Updated" },
      });
      expect(client.request).toHaveBeenCalledWith({
        method: "PATCH",
        path: "/api/publisher/apis/my-api",
        body: { price: "0.002", description: "Updated" },
      });
    });
  });

  describe("get_revenue", () => {
    it("calls revenue endpoint with days", async () => {
      await tools["gatefare.get_revenue"].handler({ slug: "my-api", days: 7 });
      expect(client.request).toHaveBeenCalledWith({
        path: "/api/publisher/apis/my-api/revenue",
        query: { days: 7 },
      });
    });

    it("defaults to 30 days", async () => {
      await tools["gatefare.get_revenue"].handler({ slug: "my-api" });
      expect(client.request).toHaveBeenCalledWith({
        path: "/api/publisher/apis/my-api/revenue",
        query: { days: 30 },
      });
    });
  });

  describe("distribute", () => {
    it("posts to distribute endpoint", async () => {
      await tools["gatefare.distribute"].handler({ slug: "my-api" });
      expect(client.request).toHaveBeenCalledWith({
        method: "POST",
        path: "/api/publisher/apis/my-api/distribute",
      });
    });

    it("is annotated as destructive", () => {
      expect(tools["gatefare.distribute"].annotations).toMatchObject({
        destructiveHint: true,
        readOnlyHint: false,
      });
    });
  });

  describe("without PAT", () => {
    it("throws PAT_NOT_CONFIGURED", async () => {
      const noPat = parseConfig({ GATEFARE_BASE_URL: "https://test.gatefare.io" });
      const noPatClient = new GatefareClient(noPat);
      const noPatTools = registerPublisherTools(noPatClient, noPat);
      await expect(
        noPatTools["gatefare.list_my_apis"].handler(),
      ).rejects.toMatchObject({ code: "PAT_NOT_CONFIGURED" });
    });
  });
});

describe("publisher schemas", () => {
  it("register_api requires valid 0x address", () => {
    expect(() =>
      registerApiSchema.parse({
        urlName: "my-api",
        name: "My",
        targetUrl: "https://e.com",
        price: "0.001",
        ownerWallet: "not-an-address",
      }),
    ).toThrow();
  });

  it("register_api rejects bad price format", () => {
    expect(() =>
      registerApiSchema.parse({
        urlName: "my-api",
        name: "My",
        targetUrl: "https://e.com",
        price: "$0.001",
        ownerWallet: "0x" + "1".repeat(40),
      }),
    ).toThrow();
  });

  it("update_api requires at least one change", () => {
    expect(() =>
      updateApiSchema.parse({ slug: "my-api", changes: {} }),
    ).toThrow();
  });

  describe("targetUrl SSRF protection", () => {
    const baseInput = {
      urlName: "my-api",
      name: "My",
      price: "0.001",
      ownerWallet: "0x" + "1".repeat(40),
    };

    it("rejects file:// scheme", () => {
      expect(() =>
        registerApiSchema.parse({
          ...baseInput,
          targetUrl: "file:///etc/passwd",
        }),
      ).toThrow();
    });

    it("rejects javascript: scheme", () => {
      expect(() =>
        registerApiSchema.parse({
          ...baseInput,
          targetUrl: "javascript:alert(1)",
        }),
      ).toThrow();
    });

    it("rejects localhost", () => {
      expect(() =>
        registerApiSchema.parse({
          ...baseInput,
          targetUrl: "http://localhost:11434/api/generate",
        }),
      ).toThrow();
    });

    it("rejects 127.0.0.1", () => {
      expect(() =>
        registerApiSchema.parse({
          ...baseInput,
          targetUrl: "http://127.0.0.1:8080/api",
        }),
      ).toThrow();
    });

    it("rejects cloud metadata host", () => {
      expect(() =>
        registerApiSchema.parse({
          ...baseInput,
          targetUrl: "http://169.254.169.254/latest/meta-data/",
        }),
      ).toThrow();
    });

    it("rejects .local mDNS hostnames", () => {
      expect(() =>
        registerApiSchema.parse({
          ...baseInput,
          targetUrl: "http://router.local/admin",
        }),
      ).toThrow();
    });

    it("accepts public https URLs", () => {
      expect(
        registerApiSchema.parse({
          ...baseInput,
          targetUrl: "https://api.example.com/v1/endpoint",
        }),
      ).toBeDefined();
    });
  });
});
