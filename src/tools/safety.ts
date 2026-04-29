import { z } from "zod";
import type { GatefareClient } from "../client.js";

const SLUG_REGEX = /^[a-z0-9_-]+$/;

export const reportAbuseSchema = z
  .object({
    apiSlug: z.string().regex(SLUG_REGEX, "Must be a valid API slug"),
    category: z.enum([
      "csam",
      "ncii",
      "illegal",
      "malware",
      "fraud",
      "copyright",
      "trademark",
      "impersonation",
      "harassment",
      "sanctions",
      "other",
    ]),
    details: z.string().min(10).max(4000),
    reporterEmail: z.string().email().optional(),
  })
  .superRefine((d, ctx) => {
    if (d.category === "copyright" && !d.reporterEmail) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["reporterEmail"],
        message: "reporterEmail is required for copyright (DMCA) reports",
      });
    }
  });

export function registerSafetyTools(client: GatefareClient) {
  return {
    "gatefare.report_abuse": {
      description:
        "Report an API for abuse — CSAM, fraud, malware, copyright, trademark, etc. Returns a reference ID for tracking. Submitting a report does not guarantee removal; trust & safety reviews each report.",
      schema: reportAbuseSchema,
      annotations: {
        title: "Report abuse",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      handler: async (input: z.infer<typeof reportAbuseSchema>) => {
        return client.request({
          method: "POST",
          path: "/api/trust/report",
          body: input,
        });
      },
    },
  };
}
