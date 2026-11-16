import { createFileRoute } from "@tanstack/react-router";
import { verifyRequestSchema } from "@/lib/request-schema";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-TinyFish-Key",
};

// JSON API for other tools: POST a query with your own TinyFish key, get an auditfish.v1 result.
export const Route = createFileRoute("/api/public/verify")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const apiKey = request.headers.get("x-tinyfish-key") ?? "";
        if (apiKey.length < 10) return Response.json({ error: "Missing X-TinyFish-Key header" }, { status: 401, headers: CORS });
        const parsed = verifyRequestSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return Response.json({ error: "Invalid request", issues: parsed.error.issues }, { status: 400, headers: CORS });
        const { discoverSources, runVerification, TinyFishError } = await import("@/lib/tinyfish.server");
        const d = parsed.data;
        try {
          const sources = d.sources?.length
            ? d.sources
            : await discoverSources(apiKey, { country: d.country, region: d.region ?? null, record_type: d.record_type, record_type_other: d.record_type_other ?? null });
          const result = await runVerification(apiKey, {
            query: { name: d.name, record_type: d.record_type === "other" ? d.record_type_other || "other" : d.record_type, country: d.country, region: d.region || null, number: d.number || null },
            record_type_other: d.record_type_other ?? null,
            sources,
            target: (d.target as any) ?? null,
            maxSources: d.target ? 1 : 2,
            signal: request.signal,
          });
          return Response.json(result, { headers: CORS });
        } catch (e) {
          const status = e instanceof TinyFishError && e.status === 401 ? 401 : 502;
          return Response.json({ error: e instanceof Error ? e.message : "Verification failed" }, { status, headers: CORS });
        }
      },
    },
  },
});
