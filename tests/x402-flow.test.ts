/**
 * Full-flow x402 tests — exercise executePaymentFlow end-to-end against
 * a mocked fetch. Covers the 402 → sign → retry handshake, error paths,
 * and amount-cap enforcement that unit tests of signPayment alone miss.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GatefareClient } from "../src/client.js";
import { parseConfig } from "../src/config.js";
import {
  executePaymentFlow,
  decodeXPaymentHeader,
  _resetX402Caches,
} from "../src/x402.js";
import { GatefareError } from "../src/types.js";

const VALID_KEY = "0x" + "a".repeat(64);
const PAY_TO = "0x1234567890123456789012345678901234567890";

function mock402(amountMicro: string): Response {
  return new Response(
    JSON.stringify({
      x402Version: 2,
      accepts: [
        {
          scheme: "exact",
          network: "eip155:8453",
          maxAmountRequired: amountMicro,
          resource: "https://gatefare.io/p/demo/weather",
          description: "demo",
          payTo: PAY_TO,
          maxTimeoutSeconds: 60,
        },
      ],
    }),
    { status: 402, headers: { "content-type": "application/json" } },
  );
}

function mockSuccess(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "X-Payment-Receipt": "settled-tx-0xabc",
    },
  });
}

describe("executePaymentFlow — full handshake", () => {
  const config = parseConfig({ WALLET_PRIVATE_KEY: VALID_KEY });
  let client: GatefareClient;

  beforeEach(() => {
    _resetX402Caches();
    client = new GatefareClient(config);
    vi.restoreAllMocks();
  });

  it("does the 402 → sign → retry dance and returns the paid response", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementationOnce(async () => mock402("10000"))
      .mockImplementationOnce(async (_url, init) => {
        // Verify the retry has the X-Payment header set correctly.
        const headers = (init?.headers ?? {}) as Record<string, string>;
        expect(headers["X-Payment"]).toBeDefined();
        const decoded = decodeXPaymentHeader(headers["X-Payment"]!) as {
          x402Version: number;
          scheme: string;
          payload: { authorization: { value: string; to: string } };
        };
        expect(decoded.x402Version).toBe(2);
        expect(decoded.scheme).toBe("exact");
        expect(decoded.payload.authorization.value).toBe("10000");
        expect(decoded.payload.authorization.to.toLowerCase()).toBe(
          PAY_TO.toLowerCase(),
        );
        return mockSuccess({ forecast: "sunny" });
      });

    const result = await executePaymentFlow(
      config,
      client,
      "https://gatefare.io/p/demo/weather",
      { method: "GET" },
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.response.status).toBe(200);
    expect(result.payment.paid).toBe(true);
    expect(result.payment.amount).toBe("0.01 USDC");
    expect(result.payment.receiptHeader).toBe("settled-tx-0xabc");
  });

  it("skips the dance when first response is 200 (free endpoint)", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(mockSuccess({ ok: true }));

    const result = await executePaymentFlow(
      config,
      client,
      "https://gatefare.io/p/free/test",
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.payment.paid).toBe(false);
  });

  it("aborts when price exceeds max_price", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(mock402("100000")); // $0.10

    await expect(
      executePaymentFlow(config, client, "https://gatefare.io/p/demo/x", {
        maxPriceUsd: 0.05,
      }),
    ).rejects.toMatchObject({ code: "PRICE_TOO_HIGH" });
  });

  it("max_price of 0 disables the cap (unlimited)", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(mock402("1000000")) // $1.00
      .mockResolvedValueOnce(mockSuccess({ ok: true }));

    const result = await executePaymentFlow(
      config,
      client,
      "https://gatefare.io/p/demo/x",
      { maxPriceUsd: 0 },
    );
    expect(result.payment.paid).toBe(true);
  });

  it("throws UPSTREAM_ERROR when the gateway rejects our payment (second 402)", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(mock402("1000"))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "bad signature" }), {
          status: 402,
          headers: { "content-type": "application/json" },
        }),
      );

    await expect(
      executePaymentFlow(config, client, "https://gatefare.io/p/demo/x"),
    ).rejects.toMatchObject({ code: "UPSTREAM_ERROR" });
  });

  it("forwards method, body, and headers to both the probe and the retry", async () => {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (u, init) => {
      calls.push({ url: String(u), init });
      return calls.length === 1 ? mock402("1000") : mockSuccess({ ok: true });
    });

    await executePaymentFlow(
      config,
      client,
      "https://gatefare.io/p/demo/echo",
      {
        method: "POST",
        body: '{"hello":"world"}',
        headers: { "X-Custom": "hi", "Content-Type": "application/json" },
      },
    );

    expect(calls).toHaveLength(2);
    for (const c of calls) {
      expect(c.init?.method).toBe("POST");
      expect(c.init?.body).toBe('{"hello":"world"}');
      expect((c.init?.headers as Record<string, string>)["X-Custom"]).toBe("hi");
    }
    // Only the second has X-Payment.
    expect((calls[0]!.init?.headers as Record<string, string>)["X-Payment"]).toBeUndefined();
    expect((calls[1]!.init?.headers as Record<string, string>)["X-Payment"]).toBeDefined();
  });

  it("network error during the probe surfaces as NETWORK_ERROR (not UPSTREAM)", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("ECONNRESET"));

    await expect(
      executePaymentFlow(config, client, "https://gatefare.io/p/demo/x"),
    ).rejects.toMatchObject({ code: "NETWORK_ERROR" });
  });

  it("rejects 402 body when content-type isn't JSON", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("plain", {
        status: 402,
        headers: { "content-type": "text/plain" },
      }),
    );
    await expect(
      executePaymentFlow(config, client, "https://gatefare.io/p/demo/x"),
    ).rejects.toThrow(GatefareError);
  });

  it("network mismatch refuses to sign for a foreign chain", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          x402Version: 2,
          accepts: [
            {
              scheme: "exact",
              network: "eip155:1", // Ethereum mainnet — not Base
              maxAmountRequired: "1000",
              resource: "test",
              payTo: PAY_TO,
            },
          ],
        }),
        { status: 402, headers: { "content-type": "application/json" } },
      ),
    );

    await expect(
      executePaymentFlow(config, client, "https://gatefare.io/p/demo/x"),
    ).rejects.toMatchObject({ code: "UPSTREAM_ERROR" });
  });
});
