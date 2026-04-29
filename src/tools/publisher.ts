import { z } from "zod";
import type { GatefareClient } from "../client.js";
import type { Config } from "../config.js";
import { GatefareError } from "../types.js";

const SLUG_REGEX = /^[a-z0-9_-]+$/;
const slugSchema = z.string().regex(SLUG_REGEX);

// Defense in depth: gatefare.io's server validates targetUrl too, but we
// reject obviously bad shapes here so a misconfigured agent doesn't spam
// the API with attempts to register file://, javascript:, or local-only
// targets. The public API will only ever proxy to public HTTPS targets.
const httpUrlSchema = z
  .string()
  .url()
  .refine(
    (u) => {
      try {
        const parsed = new URL(u);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
        // Block obviously local/internal hostnames at registration time.
        const host = parsed.hostname.toLowerCase();
        const blocked = [
          "localhost",
          "127.0.0.1",
          "0.0.0.0",
          "::1",
          "169.254.169.254", // AWS/GCP metadata
        ];
        if (blocked.includes(host)) return false;
        if (host.endsWith(".local") || host.endsWith(".internal")) return false;
        return true;
      } catch {
        return false;
      }
    },
    { message: "targetUrl must be an http/https URL pointing at a public host" },
  );

export const registerApiSchema = z.object({
  urlName: z
    .string()
    .min(3)
    .max(50)
    .regex(/^[a-z0-9-]+$/, "Must be lowercase alphanumeric with hyphens"),
  name: z.string().min(1).max(80),
  targetUrl: httpUrlSchema,
  price: z
    .string()
    .regex(/^\d+(\.\d+)?$/, "Price must be a decimal number, e.g. '0.001'"),
  ownerWallet: z.string().regex(/^0x[0-9a-fA-F]{40}$/, "Must be a 0x-prefixed Ethereum address"),
  network: z.enum(["eip155:8453", "eip155:84532"]).optional(),
  description: z.string().max(200).optional(),
  categories: z.array(z.string()).max(5).optional(),
  tags: z.array(z.string()).max(10).optional(),
  headers: z.record(z.string()).optional(),
  sampleResponse: z.string().max(4096).optional(),
  walletSignature: z.string().optional(),
});

export const listMyApisSchema = z.object({});

export const updateApiSchema = z.object({
  slug: slugSchema,
  changes: z
    .object({
      name: z.string().min(1).max(80).optional(),
      description: z.string().max(200).optional(),
      price: z.string().regex(/^\d+(\.\d+)?$/).optional(),
      categories: z.array(z.string()).max(5).optional(),
      tags: z.array(z.string()).max(10).optional(),
      sampleResponse: z.string().max(4096).optional(),
      iconUrl: z.string().url().optional(),
      targetUrl: httpUrlSchema.optional(),
      headers: z.record(z.string()).optional(),
    })
    .refine((c) => Object.keys(c).length > 0, {
      message: "At least one field must be provided in `changes`",
    }),
});

export const getRevenueSchema = z.object({
  slug: slugSchema,
  days: z
    .number()
    .int()
    .positive()
    .max(365)
    .optional()
    .describe("Lookback period in days (default 30)"),
});

export const distributeSchema = z.object({
  slug: slugSchema,
});

function requirePat(config: Config): string {
  if (!config.pat) {
    throw new GatefareError(
      "PAT_NOT_CONFIGURED",
      "Set GATEFARE_PAT to use publisher tools",
    );
  }
  return config.pat;
}

export function registerPublisherTools(
  client: GatefareClient,
  config: Config,
) {
  return {
    "gatefare.register_api": {
      description:
        "Register a new paid API on Gatefare. The API becomes available in the marketplace immediately. Returns the proxy URL and API key (the key is only shown once).",
      schema: registerApiSchema,
      annotations: {
        title: "Register API",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      handler: async (input: z.infer<typeof registerApiSchema>) => {
        requirePat(config);
        return client.request({
          method: "POST",
          path: "/api/publisher/apis",
          body: input,
        });
      },
    },

    "gatefare.list_my_apis": {
      description: "List all APIs published by the authenticated user with stats.",
      schema: listMyApisSchema,
      annotations: {
        title: "List my APIs",
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
      handler: async () => {
        requirePat(config);
        return client.request({ path: "/api/publisher/apis" });
      },
    },

    "gatefare.update_api": {
      description:
        "Update an existing API's metadata, pricing, or target URL. Changing targetUrl requires `write:sensitive` PAT scope.",
      schema: updateApiSchema,
      annotations: {
        title: "Update API",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      handler: async (input: z.infer<typeof updateApiSchema>) => {
        requirePat(config);
        return client.request({
          method: "PATCH",
          path: `/api/publisher/apis/${encodeURIComponent(input.slug)}`,
          body: input.changes,
        });
      },
    },

    "gatefare.get_revenue": {
      description:
        "Get revenue data and time series for a published API over a given period.",
      schema: getRevenueSchema,
      annotations: {
        title: "Get revenue",
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
      handler: async (input: z.infer<typeof getRevenueSchema>) => {
        requirePat(config);
        return client.request({
          path: `/api/publisher/apis/${encodeURIComponent(input.slug)}/revenue`,
          query: { days: input.days ?? 30 },
        });
      },
    },

    "gatefare.distribute": {
      description:
        "Trigger on-chain distribute() on the split contract to pay out accumulated revenue. This is destructive in the sense that it broadcasts a transaction.",
      schema: distributeSchema,
      annotations: {
        title: "Distribute revenue",
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
      handler: async (input: z.infer<typeof distributeSchema>) => {
        requirePat(config);
        return client.request({
          method: "POST",
          path: `/api/publisher/apis/${encodeURIComponent(input.slug)}/distribute`,
        });
      },
    },
  };
}
