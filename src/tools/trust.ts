// Trust + transparency tools — surfaces the publisher-side trust
// signals Gatefare exposes on /api/catalog/:slug so an agent can
// make a "is this seller worth paying" decision BEFORE issuing a
// paid call.
//
// All tools here are pure reads against the existing catalog
// endpoint — no new network surface, no breaking change to v1.0.x
// users.

import { z } from "zod";
import type { GatefareClient } from "../client.js";

const SLUG_REGEX = /^[a-z0-9_-]+$/;
const slugSchema = z
  .string()
  .regex(SLUG_REGEX, "Must be lowercase alphanumeric with hyphens or underscores");

const slugOrHandleSchema = z
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

export const publisherReputationSchema = slugOrHandleSchema;
export const sampleResponseSchema = slugOrHandleSchema;

interface CatalogDetailResponse {
  publisher?: {
    handle?: string | null;
    displayName?: string | null;
    verificationTier?: string | null;
    reputation?: {
      tenureMonths: number;
      established: boolean;
      lifetimeSuccessCalls: number;
      topContributor: boolean;
      averageRating: number | null;
      reviewCount: number;
      highlyRated: boolean;
      activeApis: number;
      computedAt: number;
    };
  };
  sampleResponse?: string | null;
  name?: string;
  slug?: string;
  price?: string;
}

function pathFor(input: z.infer<typeof slugOrHandleSchema>): string {
  return input.slug
    ? `/api/catalog/${encodeURIComponent(input.slug)}`
    : `/api/catalog/${encodeURIComponent(input.handle!)}/${encodeURIComponent(input.urlName!)}`;
}

export function registerTrustTools(client: GatefareClient) {
  return {
    "gatefare.publisher_reputation": {
      description:
        "Look up the publisher of an API and return their positive-only " +
        "trust badges: Established (>=3 months tenure), Top contributor " +
        "(>=1M lifetime successful calls), Highly rated (>=4.5 avg across " +
        ">=10 reviews). New publishers come back unmarked — absence of " +
        "badges is NOT a warning, just a lack of accumulated signal. Use " +
        "this BEFORE calling an unfamiliar API to gauge counterparty risk.",
      schema: publisherReputationSchema,
      annotations: {
        title: "Publisher reputation",
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
      handler: async (input: z.infer<typeof publisherReputationSchema>) => {
        const detail = (await client.request({
          path: pathFor(input),
        })) as CatalogDetailResponse;

        const publisher = detail.publisher ?? {};
        const reputation = publisher.reputation;

        if (!reputation) {
          // Older catalog payloads (or rows that pre-date the
          // reputation column). Honest empty result.
          return {
            slug: detail.slug ?? input.slug ?? null,
            publisher: {
              handle: publisher.handle ?? null,
              displayName: publisher.displayName ?? null,
              verificationTier: publisher.verificationTier ?? null,
            },
            reputation: null,
            note: "Reputation signal not available for this listing.",
          };
        }

        return {
          slug: detail.slug ?? input.slug ?? null,
          publisher: {
            handle: publisher.handle ?? null,
            displayName: publisher.displayName ?? null,
            verificationTier: publisher.verificationTier ?? null,
          },
          reputation: {
            tenureMonths: reputation.tenureMonths,
            established: reputation.established,
            lifetimeSuccessCalls: reputation.lifetimeSuccessCalls,
            topContributor: reputation.topContributor,
            averageRating: reputation.averageRating,
            reviewCount: reputation.reviewCount,
            highlyRated: reputation.highlyRated,
            activeApis: reputation.activeApis,
            computedAt: reputation.computedAt,
          },
          badges: [
            ...(reputation.established ? ["Established"] : []),
            ...(reputation.topContributor ? ["Top contributor"] : []),
            ...(reputation.highlyRated ? ["Highly rated"] : []),
          ],
        };
      },
    },

    "gatefare.sample_response": {
      description:
        "Fetch the publisher-pasted representative response for an API. " +
        "This is what the publisher claims their API returns on a typical " +
        "successful call. Compare against `gatefare.get_api`'s captured " +
        "example (what we actually got from probing) to spot inconsistencies " +
        "BEFORE you pay. Capped at 4 KiB UTF-8 by the platform. Returns " +
        "null when the publisher has not provided a sample (older listings).",
      schema: sampleResponseSchema,
      annotations: {
        title: "Sample response",
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
      handler: async (input: z.infer<typeof sampleResponseSchema>) => {
        const detail = (await client.request({
          path: pathFor(input),
        })) as CatalogDetailResponse;

        return {
          slug: detail.slug ?? input.slug ?? null,
          name: detail.name ?? null,
          price: detail.price ?? null,
          sampleResponse: detail.sampleResponse ?? null,
          provided: detail.sampleResponse != null,
        };
      },
    },
  };
}
