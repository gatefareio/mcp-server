import { z } from "zod";
import type { GatefareClient } from "../client.js";

const SLUG_REGEX = /^[a-z0-9_-]+$/;

const slugSchema = z
  .string()
  .regex(SLUG_REGEX, "Must be lowercase alphanumeric with hyphens or underscores");

export const searchApisSchema = z.object({
  query: z.string().optional().describe("Full-text search query"),
  max_price: z.number().nonnegative().optional().describe("Maximum price in USD"),
  category: z.string().optional().describe("Category slug"),
  sort: z
    .enum(["popular", "new", "price-asc"])
    .optional()
    .describe("Sort order"),
  page: z.number().int().positive().optional().describe("Page number"),
  include_testnet: z.boolean().optional().describe("Include testnet APIs"),
});

export const getApiSchema = z
  .object({
    slug: slugSchema.optional().describe("API slug, e.g. 'demo-weather'"),
    handle: slugSchema.optional().describe("Publisher handle"),
    urlName: slugSchema.optional().describe("API URL name"),
  })
  .superRefine((d, ctx) => {
    if (!d.slug && !(d.handle && d.urlName)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Either `slug` or both `handle` and `urlName` are required",
      });
    }
  });

export const listCategoriesSchema = z.object({});

export const suggestSchema = z.object({
  query: z.string().min(1).describe("Search query for autocomplete"),
});

export function registerDiscoveryTools(client: GatefareClient) {
  return {
    "gatefare.search_apis": {
      description:
        "Search the Gatefare catalog for paid APIs by text, price, category, or sort order. Returns paginated results with publisher info.",
      schema: searchApisSchema,
      annotations: {
        title: "Search APIs",
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
      handler: async (input: z.infer<typeof searchApisSchema>) => {
        return client.request({
          path: "/api/catalog",
          query: {
            q: input.query,
            category: input.category,
            price_max: input.max_price,
            sort: input.sort,
            page: input.page,
            includeTestnet: input.include_testnet,
          },
        });
      },
    },

    "gatefare.get_api": {
      description:
        "Get full details for a specific API by slug, or by handle + urlName pair. Returns pricing, stats, uptime, and publisher info.",
      schema: getApiSchema,
      annotations: {
        title: "Get API details",
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
      handler: async (input: z.infer<typeof getApiSchema>) => {
        const path = input.slug
          ? `/api/catalog/${encodeURIComponent(input.slug)}`
          : `/api/catalog/${encodeURIComponent(input.handle!)}/${encodeURIComponent(input.urlName!)}`;
        return client.request({ path });
      },
    },

    "gatefare.list_categories": {
      description:
        "List all available API categories in the Gatefare catalog with API counts.",
      schema: listCategoriesSchema,
      annotations: {
        title: "List categories",
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
      handler: async () => {
        return client.request({ path: "/api/catalog/categories" });
      },
    },

    "gatefare.suggest": {
      description:
        "Autocomplete search suggestions for API discovery.",
      schema: suggestSchema,
      annotations: {
        title: "Search suggestions",
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
      handler: async (input: z.infer<typeof suggestSchema>) => {
        return client.request({
          path: "/api/catalog/search/suggest",
          query: { q: input.query },
        });
      },
    },
  };
}
