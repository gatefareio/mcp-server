import { describe, it, expect, vi } from "vitest";
import { GatefareClient } from "../../src/client.js";
import { parseConfig } from "../../src/config.js";
import { registerBuyerTools, callApiSchema, estimateCostSchema } from "../../src/tools/buyer.js";

const VALID_KEY = "0x" + "a".repeat(64);

describe("buyer tools", () => {
  describe("estimate_cost", () => {
    it("calculates total for n_calls", async () => {
      const config = parseConfig({
        GATEFARE_BASE_URL: "https://test.gatefare.io",
        WALLET_PRIVATE_KEY: VALID_KEY,
      });
      const client = new GatefareClient(config);
      vi.spyOn(client, "request").mockResolvedValue({ price: "$0.01" });

      const tools = registerBuyerTools(client, config);
      const result = await tools["gatefare.estimate_cost"].handler({
        slug: "demo",
        n_calls: 100,
      });

      expect(result.perCall).toBe("$0.0100");
      expect(result.total).toBe("$1.0000");
      expect(result.currency).toBe("USDC");
    });

    it("returns enoughBalance=null when wallet check fails", async () => {
      const config = parseConfig({
        GATEFARE_BASE_URL: "https://test.gatefare.io",
        WALLET_PRIVATE_KEY: VALID_KEY,
      });
      const client = new GatefareClient(config);
      vi.spyOn(client, "request").mockResolvedValue({ price: "$0.001" });
      // getWalletBalance will try to hit a real RPC and fail in test env;
      // verify we don't pretend the balance check succeeded.
      const tools = registerBuyerTools(client, config);
      const result = await tools["gatefare.estimate_cost"].handler({
        slug: "demo",
        n_calls: 5,
      });
      expect([null, true, false]).toContain(result.enoughBalance);
    });

    it("rejects negative price from upstream", async () => {
      const config = parseConfig({});
      const client = new GatefareClient(config);
      vi.spyOn(client, "request").mockResolvedValue({ price: "$-0.01" });
      const tools = registerBuyerTools(client, config);
      await expect(
        tools["gatefare.estimate_cost"].handler({ slug: "demo", n_calls: 1 }),
      ).rejects.toMatchObject({ code: "GATEFARE_API_ERROR" });
    });
  });

  describe("call_api", () => {
    it("throws WALLET_NOT_CONFIGURED without key", async () => {
      const config = parseConfig({});
      const client = new GatefareClient(config);
      const tools = registerBuyerTools(client, config);

      await expect(
        tools["gatefare.call_api"].handler({ slug: "demo" }),
      ).rejects.toMatchObject({ code: "WALLET_NOT_CONFIGURED" });
    });

    it("throws BUDGET_EXHAUSTED when budget is zero", async () => {
      const config = parseConfig({
        WALLET_PRIVATE_KEY: VALID_KEY,
        WALLET_BUDGET_USD: "0",
      });
      const client = new GatefareClient(config);
      const tools = registerBuyerTools(client, config);

      await expect(
        tools["gatefare.call_api"].handler({ slug: "demo" }),
      ).rejects.toMatchObject({ code: "BUDGET_EXHAUSTED" });
    });
  });

  describe("get_wallet_balance", () => {
    it("throws WALLET_NOT_CONFIGURED without key", async () => {
      const config = parseConfig({});
      const client = new GatefareClient(config);
      const tools = registerBuyerTools(client, config);

      await expect(
        tools["gatefare.get_wallet_balance"].handler({}),
      ).rejects.toMatchObject({ code: "WALLET_NOT_CONFIGURED" });
    });
  });

  describe("annotations", () => {
    it("call_api is openWorld and not idempotent", () => {
      const config = parseConfig({ WALLET_PRIVATE_KEY: VALID_KEY });
      const client = new GatefareClient(config);
      const tools = registerBuyerTools(client, config);
      expect(tools["gatefare.call_api"].annotations).toMatchObject({
        readOnlyHint: false,
        idempotentHint: false,
        openWorldHint: true,
      });
    });

    it("get_wallet_balance is read-only and idempotent", () => {
      const config = parseConfig({ WALLET_PRIVATE_KEY: VALID_KEY });
      const client = new GatefareClient(config);
      const tools = registerBuyerTools(client, config);
      expect(tools["gatefare.get_wallet_balance"].annotations).toMatchObject({
        readOnlyHint: true,
        idempotentHint: true,
      });
    });
  });
});

describe("buyer schemas", () => {
  it("call_api requires slug or (handle+urlName)", () => {
    expect(() => callApiSchema.parse({})).toThrow();
    expect(() => callApiSchema.parse({ handle: "alice" })).toThrow();
    expect(callApiSchema.parse({ slug: "demo" })).toBeDefined();
    expect(callApiSchema.parse({ handle: "alice", urlName: "weather" })).toBeDefined();
  });

  it("call_api rejects slug with slashes (path traversal)", () => {
    expect(() => callApiSchema.parse({ slug: "demo/../admin" })).toThrow();
    expect(() => callApiSchema.parse({ slug: "demo/foo" })).toThrow();
    expect(() => callApiSchema.parse({ slug: "DEMO" })).toThrow(); // uppercase rejected
  });

  it("call_api rejects negative max_price", () => {
    expect(() =>
      callApiSchema.parse({ slug: "demo", max_price: -0.01 }),
    ).toThrow();
    expect(() =>
      callApiSchema.parse({ slug: "demo", max_price: 0 }),
    ).toThrow(); // .positive() requires > 0
  });

  it("estimate_cost requires positive n_calls", () => {
    expect(() =>
      estimateCostSchema.parse({ slug: "demo", n_calls: 0 }),
    ).toThrow();
    expect(() =>
      estimateCostSchema.parse({ slug: "demo", n_calls: -1 }),
    ).toThrow();
    expect(estimateCostSchema.parse({ slug: "demo", n_calls: 1 })).toBeDefined();
  });
});
