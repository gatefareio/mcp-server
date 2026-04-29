import { describe, it, expect } from "vitest";
import {
  parsePaymentInfo,
  selectPaymentRequirement,
  signPayment,
  decodeXPaymentHeader,
  type PaymentRequirement,
} from "../src/x402.js";
import { parseConfig } from "../src/config.js";
import { GatefareError } from "../src/types.js";

const VALID_KEY = "0x" + "a".repeat(64);
const PAY_TO = "0x1234567890123456789012345678901234567890" as const;

function makePaymentInfoResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 402,
    headers: { "content-type": "application/json" },
  });
}

describe("parsePaymentInfo", () => {
  it("parses a Gatefare 402 body with `accepts` array", async () => {
    const body = {
      x402Version: 2,
      accepts: [
        {
          scheme: "exact",
          network: "eip155:8453",
          maxAmountRequired: "10000",
          resource: "https://gatefare.io/p/demo/weather",
          description: "demo weather",
          payTo: PAY_TO,
          maxTimeoutSeconds: 60,
          extra: {},
        },
      ],
    };

    const info = await parsePaymentInfo(makePaymentInfoResponse(body));
    expect(info.x402Version).toBe(2);
    expect(info.accepts).toHaveLength(1);
    expect(info.accepts[0]!.maxAmountRequired).toBe("10000");
  });

  it("throws UPSTREAM_ERROR when content-type is not JSON", async () => {
    const response = new Response("plain text", {
      status: 402,
      headers: { "content-type": "text/plain" },
    });
    await expect(parsePaymentInfo(response)).rejects.toMatchObject({
      code: "UPSTREAM_ERROR",
    });
  });

  it("throws when accepts is missing", async () => {
    await expect(
      parsePaymentInfo(makePaymentInfoResponse({ x402Version: 2 })),
    ).rejects.toThrow(GatefareError);
  });

  it("throws when accepts is empty", async () => {
    await expect(
      parsePaymentInfo(makePaymentInfoResponse({ x402Version: 2, accepts: [] })),
    ).rejects.toThrow(GatefareError);
  });

  it("throws when body is not valid JSON", async () => {
    const response = new Response("{not json", {
      status: 402,
      headers: { "content-type": "application/json" },
    });
    await expect(parsePaymentInfo(response)).rejects.toMatchObject({
      code: "UPSTREAM_ERROR",
    });
  });

  it("rejects an absurdly large `accepts` array (DoS guard)", async () => {
    const huge = Array.from({ length: 200 }, (_, i) => ({
      scheme: "exact",
      network: "eip155:8453",
      maxAmountRequired: "1",
      resource: `r${i}`,
      payTo: PAY_TO,
    }));
    await expect(
      parsePaymentInfo(makePaymentInfoResponse({ x402Version: 2, accepts: huge })),
    ).rejects.toMatchObject({ code: "UPSTREAM_ERROR" });
  });
});

describe("selectPaymentRequirement", () => {
  const requirements: PaymentRequirement[] = [
    {
      scheme: "exact",
      network: "eip155:8453",
      maxAmountRequired: "1000",
      resource: "test",
      payTo: PAY_TO,
    },
    {
      scheme: "exact",
      network: "eip155:84532",
      maxAmountRequired: "1000",
      resource: "test",
      payTo: PAY_TO,
    },
  ];

  it("picks matching network", () => {
    expect(selectPaymentRequirement(requirements, "eip155:8453").network).toBe(
      "eip155:8453",
    );
    expect(selectPaymentRequirement(requirements, "eip155:84532").network).toBe(
      "eip155:84532",
    );
  });

  it("REFUSES to fall back to a different network (security)", () => {
    // Critical: a malicious gateway returning Sepolia-only requirements
    // to a mainnet user must NOT cause us to sign on Sepolia.
    expect(() => selectPaymentRequirement(requirements, "eip155:1")).toThrow(
      GatefareError,
    );
    const sepoliaOnly = [requirements[1]!];
    expect(() => selectPaymentRequirement(sepoliaOnly, "eip155:8453")).toThrow(
      /No payment requirement matches/,
    );
  });

  it("rejects non-exact scheme even on matching network", () => {
    const upgrade: PaymentRequirement[] = [
      {
        scheme: "upgrade-future-scheme",
        network: "eip155:8453",
        maxAmountRequired: "1000",
        resource: "test",
        payTo: PAY_TO,
      },
    ];
    expect(() => selectPaymentRequirement(upgrade, "eip155:8453")).toThrow(
      GatefareError,
    );
  });

  it("throws on empty array", () => {
    expect(() => selectPaymentRequirement([], "eip155:8453")).toThrow(GatefareError);
  });
});

describe("signPayment — produces a header that Gatefare's parser would accept", () => {
  const config = parseConfig({
    WALLET_PRIVATE_KEY: VALID_KEY,
    WALLET_NETWORK: "eip155:8453",
  });

  const requirement: PaymentRequirement = {
    scheme: "exact",
    network: "eip155:8453",
    maxAmountRequired: "10000", // micro-USDC
    resource: "https://gatefare.io/p/demo/weather",
    payTo: PAY_TO,
    maxTimeoutSeconds: 60,
  };

  it("produces base64-encoded JSON with v2 envelope", async () => {
    const signed = await signPayment(config, requirement);

    expect(signed.amount).toBe("0.01");
    expect(signed.amountMicro).toBe("10000");
    expect(signed.xPaymentHeader).toMatch(/^[A-Za-z0-9+/=]+$/);

    const decoded = decodeXPaymentHeader(signed.xPaymentHeader) as {
      x402Version: number;
      scheme: string;
      network: string;
      payload: {
        signature: string;
        authorization: {
          from: string;
          to: string;
          value: string;
          validAfter: string;
          validBefore: string;
          nonce: string;
        };
      };
    };

    expect(decoded.x402Version).toBe(2);
    expect(decoded.scheme).toBe("exact");
    expect(decoded.network).toBe("eip155:8453");
    expect(decoded.payload.signature).toMatch(/^0x[0-9a-f]+$/i);
    expect(decoded.payload.authorization.to.toLowerCase()).toBe(
      PAY_TO.toLowerCase(),
    );
    expect(decoded.payload.authorization.value).toBe("10000");
    expect(decoded.payload.authorization.nonce).toMatch(/^0x[0-9a-f]{64}$/i);
    expect(decoded.payload.authorization.validAfter).toBe("0");
  });

  it("uses unique nonce on each sign (no Date.now collision)", async () => {
    const [a, b] = await Promise.all([
      signPayment(config, requirement),
      signPayment(config, requirement),
    ]);
    const decA = decodeXPaymentHeader(a.xPaymentHeader) as {
      payload: { authorization: { nonce: string } };
    };
    const decB = decodeXPaymentHeader(b.xPaymentHeader) as {
      payload: { authorization: { nonce: string } };
    };
    expect(decA.payload.authorization.nonce).not.toBe(
      decB.payload.authorization.nonce,
    );
  });

  it("validBefore is in the future, validAfter is 0", async () => {
    const signed = await signPayment(config, requirement);
    const decoded = decodeXPaymentHeader(signed.xPaymentHeader) as {
      payload: { authorization: { validAfter: string; validBefore: string } };
    };
    const now = Math.floor(Date.now() / 1000);
    expect(parseInt(decoded.payload.authorization.validAfter)).toBe(0);
    expect(parseInt(decoded.payload.authorization.validBefore)).toBeGreaterThan(now);
  });

  it("throws WALLET_NOT_CONFIGURED without a key", async () => {
    const noKey = parseConfig({});
    await expect(signPayment(noKey, requirement)).rejects.toMatchObject({
      code: "WALLET_NOT_CONFIGURED",
    });
  });

  it("rejects zero or negative maxAmountRequired", async () => {
    await expect(
      signPayment(config, { ...requirement, maxAmountRequired: "0" }),
    ).rejects.toMatchObject({ code: "UPSTREAM_ERROR" });
  });

  it("clamps maxTimeoutSeconds to 1 hour even if server requests more", async () => {
    const signed = await signPayment(config, {
      ...requirement,
      maxTimeoutSeconds: 999_999_999,
    });
    const decoded = decodeXPaymentHeader(signed.xPaymentHeader) as {
      payload: { authorization: { validBefore: string } };
    };
    const now = Math.floor(Date.now() / 1000);
    const window = parseInt(decoded.payload.authorization.validBefore) - now;
    expect(window).toBeLessThanOrEqual(3600);
    expect(window).toBeGreaterThan(0);
  });
});
