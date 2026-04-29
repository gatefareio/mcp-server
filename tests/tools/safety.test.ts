import { describe, it, expect, vi, beforeEach } from "vitest";
import { GatefareClient } from "../../src/client.js";
import { parseConfig } from "../../src/config.js";
import { registerSafetyTools, reportAbuseSchema } from "../../src/tools/safety.js";

describe("safety tools", () => {
  const config = parseConfig({
    GATEFARE_BASE_URL: "https://test.gatefare.io",
  });

  let client: GatefareClient;
  let tools: ReturnType<typeof registerSafetyTools>;

  beforeEach(() => {
    client = new GatefareClient(config);
    vi.spyOn(client, "request").mockResolvedValue({ referenceId: "ref-123" });
    tools = registerSafetyTools(client);
  });

  it("posts abuse report", async () => {
    await tools["gatefare.report_abuse"].handler({
      apiSlug: "bad-api",
      category: "fraud",
      details: "This API is fraudulent and takes money without providing data",
    });

    expect(client.request).toHaveBeenCalledWith({
      method: "POST",
      path: "/api/trust/report",
      body: expect.objectContaining({
        apiSlug: "bad-api",
        category: "fraud",
      }),
    });
  });

  it("includes reporter email for copyright", async () => {
    await tools["gatefare.report_abuse"].handler({
      apiSlug: "stolen-api",
      category: "copyright",
      details: "This API is using my copyrighted content without permission",
      reporterEmail: "owner@example.com",
    });

    expect(client.request).toHaveBeenCalledWith({
      method: "POST",
      path: "/api/trust/report",
      body: expect.objectContaining({
        category: "copyright",
        reporterEmail: "owner@example.com",
      }),
    });
  });

  it("requires email for copyright (DMCA)", () => {
    expect(() =>
      reportAbuseSchema.parse({
        apiSlug: "stolen-api",
        category: "copyright",
        details: "valid 10+ char details",
      }),
    ).toThrow();
  });

  it("rejects too-short details", () => {
    expect(() =>
      reportAbuseSchema.parse({
        apiSlug: "bad",
        category: "fraud",
        details: "short",
      }),
    ).toThrow();
  });

  it("rejects invalid slug", () => {
    expect(() =>
      reportAbuseSchema.parse({
        apiSlug: "bad/slug",
        category: "fraud",
        details: "valid 10+ char details",
      }),
    ).toThrow();
  });
});
