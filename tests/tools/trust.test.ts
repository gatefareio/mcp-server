// Unit tests for the v1.1.0 trust + transparency tools.
//
// Two tool surfaces:
//   - gatefare.publisher_reputation
//   - gatefare.sample_response
//
// Both call /api/catalog/:slug (or the canonical handle/urlName
// variant) and project a narrow slice of the response. The catalog
// endpoint itself is exercised in discovery.test.ts; here we
// validate that:
//
//   1. Input schemas accept slug-only, (handle+urlName), reject both
//      missing.
//   2. Output shape is correct for the "reputation present" case.
//   3. Output shape is correct for legacy listings where the field
//      is missing on the upstream response (forward-compat).
//   4. Sample response surfaces null + provided=false cleanly.

import { describe, it, expect } from "vitest";
import { registerTrustTools } from "../../src/tools/trust.js";
import type { GatefareClient } from "../../src/client.js";

/** Tiny client stub — exposes `request` and asserts what was called. */
function mockClient(response: unknown): {
  client: GatefareClient;
  lastPath: () => string | null;
} {
  let lastPath: string | null = null;
  const client = {
    request: async (opts: { path: string }) => {
      lastPath = opts.path;
      return response;
    },
  } as unknown as GatefareClient;
  return { client, lastPath: () => lastPath };
}

describe("gatefare.publisher_reputation", () => {
  it("surfaces all reputation booleans + computed badges array", async () => {
    const { client, lastPath } = mockClient({
      slug: "weather-now",
      publisher: {
        handle: "alice",
        displayName: "Alice",
        verificationTier: null,
        reputation: {
          tenureMonths: 8,
          established: true,
          lifetimeSuccessCalls: 1_250_000,
          topContributor: true,
          averageRating: 4.7,
          reviewCount: 42,
          highlyRated: true,
          activeApis: 3,
          computedAt: 1_716_000_000_000,
        },
      },
    });
    const tools = registerTrustTools(client);
    const out = (await tools["gatefare.publisher_reputation"].handler({
      slug: "weather-now",
    })) as { reputation: any; badges: string[]; publisher: any };

    expect(lastPath()).toBe("/api/catalog/weather-now");
    expect(out.reputation.established).toBe(true);
    expect(out.reputation.topContributor).toBe(true);
    expect(out.reputation.highlyRated).toBe(true);
    expect(out.reputation.activeApis).toBe(3);
    expect(out.badges).toEqual(["Established", "Top contributor", "Highly rated"]);
    expect(out.publisher.handle).toBe("alice");
  });

  it("returns empty badges array for a fresh account (all booleans false)", async () => {
    const { client } = mockClient({
      slug: "fresh-api",
      publisher: {
        handle: "newbie",
        displayName: null,
        verificationTier: null,
        reputation: {
          tenureMonths: 0,
          established: false,
          lifetimeSuccessCalls: 5,
          topContributor: false,
          averageRating: null,
          reviewCount: 0,
          highlyRated: false,
          activeApis: 1,
          computedAt: 1_716_000_000_000,
        },
      },
    });
    const tools = registerTrustTools(client);
    const out = (await tools["gatefare.publisher_reputation"].handler({
      slug: "fresh-api",
    })) as { badges: string[]; reputation: any };
    expect(out.badges).toEqual([]);
    expect(out.reputation.tenureMonths).toBe(0);
  });

  it("handles legacy listings where reputation field is absent", async () => {
    const { client } = mockClient({
      slug: "legacy-api",
      publisher: { handle: "legacy", displayName: "Legacy" },
      // no `reputation` key at all
    });
    const tools = registerTrustTools(client);
    const out = (await tools["gatefare.publisher_reputation"].handler({
      slug: "legacy-api",
    })) as { reputation: null; note?: string };
    expect(out.reputation).toBeNull();
    expect(out.note).toMatch(/not available/i);
  });

  it("routes to the canonical handle+urlName path when slug is omitted", async () => {
    const { client, lastPath } = mockClient({
      publisher: { reputation: { tenureMonths: 1, established: false,
        lifetimeSuccessCalls: 0, topContributor: false,
        averageRating: null, reviewCount: 0, highlyRated: false,
        activeApis: 0, computedAt: 0 } },
    });
    const tools = registerTrustTools(client);
    await tools["gatefare.publisher_reputation"].handler({
      handle: "alice",
      urlName: "weather-now",
    });
    expect(lastPath()).toBe("/api/catalog/alice/weather-now");
  });
});

describe("gatefare.sample_response", () => {
  it("returns the publisher-pasted sample + provided=true when present", async () => {
    const { client, lastPath } = mockClient({
      slug: "weather-now",
      name: "Weather Now",
      price: "$0.01",
      sampleResponse: '{"temperature_c": 21.3, "conditions": "sunny"}',
    });
    const tools = registerTrustTools(client);
    const out = (await tools["gatefare.sample_response"].handler({
      slug: "weather-now",
    })) as {
      sampleResponse: string | null;
      provided: boolean;
      name: string | null;
      price: string | null;
    };
    expect(lastPath()).toBe("/api/catalog/weather-now");
    expect(out.provided).toBe(true);
    expect(out.sampleResponse).toContain("temperature_c");
    expect(out.name).toBe("Weather Now");
    expect(out.price).toBe("$0.01");
  });

  it("returns provided=false and null sample for legacy listings", async () => {
    const { client } = mockClient({
      slug: "legacy-api",
      name: "Legacy API",
      sampleResponse: null,
    });
    const tools = registerTrustTools(client);
    const out = (await tools["gatefare.sample_response"].handler({
      slug: "legacy-api",
    })) as { sampleResponse: string | null; provided: boolean };
    expect(out.provided).toBe(false);
    expect(out.sampleResponse).toBeNull();
  });

  it("routes to the canonical handle+urlName path when slug is omitted", async () => {
    const { client, lastPath } = mockClient({ sampleResponse: null });
    const tools = registerTrustTools(client);
    await tools["gatefare.sample_response"].handler({
      handle: "alice",
      urlName: "weather-now",
    });
    expect(lastPath()).toBe("/api/catalog/alice/weather-now");
  });
});

describe("input schemas", () => {
  it("publisher_reputation rejects when neither slug nor handle+urlName provided", () => {
    const tools = registerTrustTools({} as GatefareClient);
    const parse = tools["gatefare.publisher_reputation"].schema.safeParse({});
    expect(parse.success).toBe(false);
  });

  it("sample_response rejects when only handle is provided (urlName missing)", () => {
    const tools = registerTrustTools({} as GatefareClient);
    const parse = tools["gatefare.sample_response"].schema.safeParse({
      handle: "alice",
    });
    expect(parse.success).toBe(false);
  });
});
