import { z } from "zod";

const candidate = z.object({
  holder_name: z.string().max(300),
  number: z.string().max(100).nullable(),
  location: z.string().max(500).nullable(),
  status_raw: z.string().max(300).nullable(),
  status: z.string().max(20),
  detail_url: z.string().max(2000).nullable(),
});

const source = z.object({
  id: z.string().max(200),
  name: z.string().max(200),
  url: z.string().url().max(2000),
  domain: z.string().max(300),
  kind: z.enum(["known", "discovered"]),
  notes: z.string().max(300).optional(),
});

export const verifyRequestSchema = z.object({
  name: z.string().trim().min(2).max(200),
  record_type: z.string().min(2).max(40),
  record_type_other: z.string().max(120).nullable().optional(),
  country: z.string().min(2).max(80),
  region: z.string().max(80).nullable().optional(),
  number: z.string().max(100).nullable().optional(),
  sources: z.array(source).max(8).optional(),
  target: candidate.nullable().optional(),
});

export type VerifyRequest = z.infer<typeof verifyRequestSchema>;
