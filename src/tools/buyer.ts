import { z } from "zod";
import type { GatefareClient } from "../client.js";
import type { Config } from "../config.js";
import { executePaymentFlow, getWalletBalance } from "../x402.js";
import { GatefareError } from "../types.js";

// Slug / handle / urlName must be safe to put directly into a URL path
// without encoding semantics. We accept lowercase alphanumerics, hyphens
// and underscores. This blocks `..`, `/`, query strings, etc.
const SLUG_REGEX = /^[a-z0-9_-]+$/;

const slugSchema = z.string().regex(SLUG_REGEX, "Must be lowercase alphanumeric with hyphens or underscores");

export const callApiSchema = z
  .object({
    slug: slugSchema.optional().describe("API slug, e.g. 'demo-weather'"),
    handle: slugSchema.optional().describe("Publisher handle, e.g. 'alice'"),
    urlName: slugSchema.optional().describe("API URL name, e.g. 'weather'"),
    method: z
      .enum(["GET", "POST", "PUT", "PATCH", "DELETE"])
      .optional()
      .describe("HTTP method, default GET"),
    query: z.record(z.string()).optional().describe("Query string parameters"),
    body: z.unknown().optional().describe("Request body for POST/PUT (sent as JSON)"),
    headers: z.record(z.string()).optional().describe("Extra request headers (do not set X-Payment)"),
    max_price: z
      .number()
      .positive()
      .optional()
      .describe("Abort if price exceeds this USD amount"),
  })
  .superRefine((d, ctx) => {
    if (!d.slug && !(d.handle && d.urlName)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Either `slug` or both `handle` and `urlName` are required",
      });
    }
  });

export const getWalletBalanceSchema = z.object({});

export const estimateCostSchema = z
  .object({
    slug: slugSchema.optional(),
    handle: slugSchema.optional(),
    urlName: slugSchema.optional(),
    n_calls: z.number().int().positive().describe("Number of planned calls"),
  })
  .superRefine((d, ctx) => {
    if (!d.slug && !(d.handle && d.urlName)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Either `slug` or both `handle` and `urlName` are required",
      });
    }
  });

function buildProxyUrl(
  baseUrl: string,
  input: { slug?: string; handle?: string; urlName?: string },
  query?: Record<string, string>,
): string {
  // slug-style: /p/<slug>; pair-style: /p/<handle>/<urlName>.
  // Inputs have already been validated by zod against SLUG_REGEX, but
  // encode anyway as defense in depth.
  const path = input.slug
    ? `/p/${encodeURIComponent(input.slug)}`
    : `/p/${encodeURIComponent(input.handle!)}/${encodeURIComponent(input.urlName!)}`;
  const url = new URL(path, baseUrl);
  if (query) {
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  }
  return url.toString();
}

function buildCatalogPath(input: { slug?: string; handle?: string; urlName?: string }): string {
  return input.slug
    ? `/api/catalog/${encodeURIComponent(input.slug)}`
    : `/api/catalog/${encodeURIComponent(input.handle!)}/${encodeURIComponent(input.urlName!)}`;
}

/**
 * In-process budget tracker. `withBudget` serializes the check-and-decrement
 * around an async paid call so concurrent invocations can't both pass the
 * "is budget left?" check before either decrements. Single-process only —
 * out-of-band fund a wallet only with what you want spent if you need a
 * hard cap across processes.
 */
function makeBudgetTracker(initialUsd: number | null) {
  let remaining = initialUsd;
  let lock: Promise<void> = Promise.resolve();

  return {
    get remaining() {
      return remaining;
    },
    async withBudget<T>(estUsd: number, fn: () => Promise<{ value: T; chargedUsd: number }>): Promise<T> {
      // Serialize entry through a chained promise.
      const wait = lock;
      let release!: () => void;
      lock = new Promise<void>((res) => (release = res));
      await wait;

      try {
        if (remaining !== null && remaining <= 0) {
          throw new GatefareError(
            "BUDGET_EXHAUSTED",
            `Runtime budget of $${initialUsd} is exhausted`,
          );
        }
        if (remaining !== null && estUsd > remaining) {
          throw new GatefareError(
            "BUDGET_EXHAUSTED",
            `Estimated cost $${estUsd.toFixed(4)} exceeds remaining budget $${remaining.toFixed(4)}`,
          );
        }
        const { value, chargedUsd } = await fn();
        if (remaining !== null) remaining -= chargedUsd;
        return value;
      } finally {
        release();
      }
    },
  };
}

export function registerBuyerTools(client: GatefareClient, config: Config) {
  const budget = makeBudgetTracker(config.walletBudgetUsd);

  return {
    "gatefare.call_api": {
      description:
        "Execute a paid API call through Gatefare's x402 payment flow. Handles 402 negotiation, USDC signing (EIP-3009), and payment automatically. Returns the upstream response and a payment receipt.",
      schema: callApiSchema,
      annotations: {
        title: "Call paid API",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      handler: async (input: z.infer<typeof callApiSchema>) => {
        if (!config.walletPrivateKey) {
          throw new GatefareError(
            "WALLET_NOT_CONFIGURED",
            "Set WALLET_PRIVATE_KEY to make paid API calls",
          );
        }

        const url = buildProxyUrl(config.baseUrl, input, input.query);

        // Pre-flight: if we have a budget, refuse to start a call we
        // already know will exceed it. We use 0 as the "we don't know yet"
        // estimate since the actual price comes from the 402 response.
        const result = await budget.withBudget(0, async () => {
          const requestHeaders: Record<string, string> = { ...input.headers };
          let bodyString: string | undefined;
          if (input.body !== undefined) {
            bodyString = JSON.stringify(input.body);
            if (!Object.keys(requestHeaders).some((k) => k.toLowerCase() === "content-type")) {
              requestHeaders["Content-Type"] = "application/json";
            }
          }

          const flow = await executePaymentFlow(config, client, url, {
            method: input.method,
            headers: requestHeaders,
            body: bodyString,
            maxPriceUsd: input.max_price,
          });

          const responseHeaders: Record<string, string> = {};
          flow.response.headers.forEach((v, k) => {
            responseHeaders[k] = v;
          });

          const contentType = flow.response.headers.get("content-type") ?? "";
          let body: unknown;
          if (contentType.includes("application/json")) {
            body = await flow.response.json();
          } else {
            body = await flow.response.text();
          }

          // Charge the budget by the human-readable amount (e.g. "0.001").
          // Validate it's a real, finite, non-negative number before
          // decrementing — otherwise NaN would silently disable the cap
          // (NaN <= 0 is always false, so the next call still passes).
          let chargedUsd = 0;
          if (flow.payment.paid) {
            const parsed = parseFloat(flow.payment.amount.replace(" USDC", ""));
            if (!Number.isFinite(parsed) || parsed < 0) {
              throw new GatefareError(
                "UPSTREAM_ERROR",
                `Server returned an unparseable payment amount: ${flow.payment.amount}`,
              );
            }
            chargedUsd = parsed;
          }

          return {
            value: {
              status: flow.response.status,
              headers: responseHeaders,
              body,
              payment: flow.payment,
            },
            chargedUsd,
          };
        });

        return result;
      },
    },

    "gatefare.get_wallet_balance": {
      description:
        "Check USDC and ETH balances for the configured wallet on Base. Also shows the remaining runtime budget if one is set.",
      schema: getWalletBalanceSchema,
      annotations: {
        title: "Wallet balance",
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
      handler: async () => {
        const balance = await getWalletBalance(config);
        return {
          address: balance.address,
          network: config.walletNetwork,
          balances: {
            usdc: balance.usdc,
            eth: balance.eth,
          },
          remainingBudget:
            budget.remaining !== null ? budget.remaining.toFixed(4) : undefined,
        };
      },
    },

    "gatefare.estimate_cost": {
      description:
        "Estimate the total cost of multiple API calls before executing them. Reports whether the wallet has sufficient USDC.",
      schema: estimateCostSchema,
      annotations: {
        title: "Estimate cost",
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
      handler: async (input: z.infer<typeof estimateCostSchema>) => {
        const path = buildCatalogPath(input);
        const api = await client.request<{ price: string }>({ path });
        const priceNum = parseFloat(api.price.replace("$", ""));
        if (!Number.isFinite(priceNum) || priceNum < 0) {
          throw new GatefareError(
            "GATEFARE_API_ERROR",
            `Catalog returned an invalid price: ${api.price}`,
          );
        }
        const total = priceNum * input.n_calls;

        let walletBalance: string | undefined;
        let enoughBalance: boolean | null = null;

        if (config.walletPrivateKey) {
          try {
            const balance = await getWalletBalance(config);
            walletBalance = balance.usdc;
            enoughBalance = parseFloat(balance.usdc) >= total;
          } catch (err) {
            // Surface the failure rather than silently claiming success.
            // Use stderr so we don't pollute the MCP stdio channel.
            process.stderr.write(
              `[gatefare-mcp] balance check failed: ${err instanceof Error ? err.message : String(err)}\n`,
            );
          }
        }

        return {
          perCall: `$${priceNum.toFixed(4)}`,
          total: `$${total.toFixed(4)}`,
          currency: "USDC" as const,
          enoughBalance, // null if we couldn't check
          walletBalance,
        };
      },
    },
  };
}
