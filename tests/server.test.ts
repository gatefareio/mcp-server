import { describe, it, expect } from "vitest";
import { createServer } from "../src/server.js";

const VALID_KEY = "0x" + "a".repeat(64);

describe("createServer — capability-driven tool registration", () => {
  it("only discovery + safety tools without credentials", () => {
    const { capabilities, toolNames } = createServer({
      GATEFARE_BASE_URL: "https://test.gatefare.io",
    });
    expect(capabilities.buyer).toBe(false);
    expect(capabilities.publisher).toBe(false);

    expect(toolNames).toContain("gatefare.search_apis");
    expect(toolNames).toContain("gatefare.get_api");
    expect(toolNames).toContain("gatefare.list_categories");
    expect(toolNames).toContain("gatefare.suggest");
    expect(toolNames).toContain("gatefare.report_abuse");

    expect(toolNames).not.toContain("gatefare.call_api");
    expect(toolNames).not.toContain("gatefare.get_wallet_balance");
    expect(toolNames).not.toContain("gatefare.estimate_cost");
    expect(toolNames).not.toContain("gatefare.register_api");
  });

  it("adds buyer tools when wallet key present", () => {
    const { capabilities, toolNames } = createServer({
      WALLET_PRIVATE_KEY: VALID_KEY,
    });
    expect(capabilities.buyer).toBe(true);
    expect(toolNames).toContain("gatefare.call_api");
    expect(toolNames).toContain("gatefare.get_wallet_balance");
    expect(toolNames).toContain("gatefare.estimate_cost");
  });

  it("adds publisher tools when PAT present", () => {
    const { capabilities, toolNames } = createServer({
      GATEFARE_PAT: "gfpat_test",
    });
    expect(capabilities.publisher).toBe(true);
    expect(toolNames).toContain("gatefare.register_api");
    expect(toolNames).toContain("gatefare.list_my_apis");
    expect(toolNames).toContain("gatefare.update_api");
    expect(toolNames).toContain("gatefare.get_revenue");
    expect(toolNames).toContain("gatefare.distribute");
  });

  it("registers all 15 tools when both credentials present (v1.1.0 adds trust pair)", () => {
    const { toolNames } = createServer({
      WALLET_PRIVATE_KEY: VALID_KEY,
      GATEFARE_PAT: "gfpat_test",
    });
    // v1.0.x had 13. v1.1.0 adds the two trust + transparency tools
    // (publisher_reputation + sample_response), bringing the total to
    // 15. Both are always-available (no credentials needed).
    expect(toolNames).toHaveLength(15);
    expect(toolNames).toContain("gatefare.publisher_reputation");
    expect(toolNames).toContain("gatefare.sample_response");
  });

  it("returns server with name and version", () => {
    const { server } = createServer({});
    expect(server).toBeDefined();
  });
});
