import { describe, it, expect } from "vitest";
import { parseConfig, detectCapabilities } from "../src/config.js";

describe("parseConfig", () => {
  it("returns defaults for empty env", () => {
    const config = parseConfig({});
    expect(config.baseUrl).toBe("https://gatefare.io");
    expect(config.walletPrivateKey).toBeNull();
    expect(config.walletBudgetUsd).toBeNull();
    expect(config.walletNetwork).toBe("eip155:8453");
    expect(config.pat).toBeNull();
    expect(config.logLevel).toBe("info");
  });

  it("parses valid private key with 0x prefix", () => {
    const key = "0x" + "a".repeat(64);
    const config = parseConfig({ WALLET_PRIVATE_KEY: key });
    expect(config.walletPrivateKey).toBe(key);
  });

  it("adds 0x prefix if missing", () => {
    const key = "b".repeat(64);
    const config = parseConfig({ WALLET_PRIVATE_KEY: key });
    expect(config.walletPrivateKey).toBe("0x" + key);
  });

  it("throws on malformed private key", () => {
    expect(() => parseConfig({ WALLET_PRIVATE_KEY: "0xshort" })).toThrow(
      "32-byte hex string",
    );
  });

  it("treats empty private key as null", () => {
    const config = parseConfig({ WALLET_PRIVATE_KEY: "  " });
    expect(config.walletPrivateKey).toBeNull();
  });

  it("parses valid PAT", () => {
    const config = parseConfig({ GATEFARE_PAT: "gfpat_test123" });
    expect(config.pat).toBe("gfpat_test123");
  });

  it("throws on PAT without prefix", () => {
    expect(() => parseConfig({ GATEFARE_PAT: "bad_token" })).toThrow(
      "gfpat_",
    );
  });

  it("treats empty PAT as null", () => {
    const config = parseConfig({ GATEFARE_PAT: "  " });
    expect(config.pat).toBeNull();
  });

  it("parses budget", () => {
    const config = parseConfig({ WALLET_BUDGET_USD: "5.50" });
    expect(config.walletBudgetUsd).toBe(5.5);
  });

  it("throws on negative budget", () => {
    expect(() => parseConfig({ WALLET_BUDGET_USD: "-1" })).toThrow(
      "non-negative",
    );
  });

  it("throws on NaN budget", () => {
    expect(() => parseConfig({ WALLET_BUDGET_USD: "abc" })).toThrow(
      "non-negative",
    );
  });

  it("throws on invalid network", () => {
    expect(() => parseConfig({ WALLET_NETWORK: "eip155:1" })).toThrow(
      "eip155:8453",
    );
  });

  it("strips trailing slash from base URL", () => {
    const config = parseConfig({ GATEFARE_BASE_URL: "https://example.com/" });
    expect(config.baseUrl).toBe("https://example.com");
  });

  it("accepts valid log levels", () => {
    expect(parseConfig({ LOG_LEVEL: "debug" }).logLevel).toBe("debug");
    expect(parseConfig({ LOG_LEVEL: "error" }).logLevel).toBe("error");
  });

  it("defaults invalid log level to info", () => {
    expect(parseConfig({ LOG_LEVEL: "verbose" }).logLevel).toBe("info");
  });
});

describe("detectCapabilities", () => {
  it("only discovery without credentials", () => {
    const config = parseConfig({});
    const caps = detectCapabilities(config);
    expect(caps.discovery).toBe(true);
    expect(caps.buyer).toBe(false);
    expect(caps.publisher).toBe(false);
  });

  it("buyer enabled with wallet key", () => {
    const config = parseConfig({ WALLET_PRIVATE_KEY: "0x" + "a".repeat(64) });
    const caps = detectCapabilities(config);
    expect(caps.buyer).toBe(true);
    expect(caps.publisher).toBe(false);
  });

  it("publisher enabled with PAT", () => {
    const config = parseConfig({ GATEFARE_PAT: "gfpat_test" });
    const caps = detectCapabilities(config);
    expect(caps.buyer).toBe(false);
    expect(caps.publisher).toBe(true);
  });

  it("all enabled with both credentials", () => {
    const config = parseConfig({
      WALLET_PRIVATE_KEY: "0x" + "c".repeat(64),
      GATEFARE_PAT: "gfpat_full",
    });
    const caps = detectCapabilities(config);
    expect(caps.buyer).toBe(true);
    expect(caps.publisher).toBe(true);
  });
});
