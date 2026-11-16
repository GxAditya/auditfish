import { createFileRoute } from "@tanstack/react-router";
import { verifyRequestSchema } from "@/lib/request-schema";

// Streams verification progress as NDJSON. The caller's own TinyFish key (BYOK)
// is required in the X-TinyFish-Key header; nothing is stored server-side.
export const Route = createFileRoute("/api/public/verify-stream")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = request.headers.get("x-tinyfish-key") ?? "";
        if (apiKey.length < 10) return Response.json({ error: "Missing X-TinyFish-Key header" }, { status: 401 });
        const parsed = verifyRequestSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return Response.json({ error: "Invalid request", issues: parsed.error.issues }, { status: 400 });
        const { discoverSources, runVerification, TinyFishError } = await import("@/lib/tinyfish.server");
        const d = parsed.data;
        const enc = new TextEncoder();
        // Closing the tab cancels the stream; that must also cancel the paid TinyFish run.
        const abort = new AbortController();
        request.signal?.addEventListener("abort", () => abort.abort());
        const stream = new ReadableStream({
          cancel() {
            abort.abort();
          },
          async start(controller) {
            const send = (o: unknown) => {
              if (abort.signal.aborted) return;
              try {
                controller.enqueue(enc.encode(JSON.stringify(o) + "\n"));
              } catch {
                abort.abort();
              }
            };
            try {
              const sources = d.sources?.length
                ? d.sources
                : await discoverSources(apiKey, { country: d.country, region: d.region ?? null, record_type: d.record_type, record_type_other: d.record_type_other ?? null });
              const result = await runVerification(
                apiKey,
                {
                  query: { name: d.name, record_type: d.record_type === "other" ? d.record_type_other || "other" : d.record_type, country: d.country, region: d.region || null, number: d.number || null },
                  record_type_other: d.record_type_other ?? null,
                  sources,
                  target: (d.target as any) ?? null,
                  maxSources: d.target ? 1 : 2,
                  signal: abort.signal,
                },
                send,
              );
              send({ type: "result", result });
            } catch (e) {
              send({ type: "error", message: e instanceof TinyFishError ? e.message : "Verification failed unexpectedly." });
            } finally {
              try {
                controller.close();
              } catch {
                /* already cancelled by the client */
              }
            }
          },
        });
        return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" } });
      },
    },
  },
});
