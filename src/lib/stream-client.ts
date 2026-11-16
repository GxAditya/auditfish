import type { VerificationResult, SourceCheck } from "./verification";
import type { VerifyRequest } from "./request-schema";

export type StreamEvent =
  | { type: "status"; message: string }
  | { type: "streaming_url"; url: string; source: string }
  | { type: "run_started"; run_id: string; source: string }
  | { type: "progress"; message: string; source: string }
  | { type: "source_done"; check: SourceCheck }
  | { type: "result"; result: VerificationResult }
  | { type: "error"; message: string };

export async function streamVerify(apiKey: string, body: VerifyRequest, onEvent: (e: StreamEvent) => void, signal?: AbortSignal) {
  const res = await fetch("/api/public/verify-stream", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-TinyFish-Key": apiKey },
    body: JSON.stringify(body),
    signal: signal ?? null,
  });
  if (!res.ok || !res.body) {
    const j = await res.json().catch(() => null);
    onEvent({ type: "error", message: j?.error ?? `Request failed (${res.status})` });
    return;
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (line) {
        try {
          onEvent(JSON.parse(line));
        } catch {
          /* ignore partial */
        }
      }
    }
  }
}
