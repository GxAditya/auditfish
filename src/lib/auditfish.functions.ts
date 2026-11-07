import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  createMonitor,
  deleteMonitor,
  discoverSources,
  listMonitors,
  patchMonitor,
  runMonitor,
  TinyFishError,
} from "./tinyfish.server";

const key = z.string().min(10).max(500);

function fail(e: unknown): never {
  if (e instanceof TinyFishError) throw new Error(e.message);
  throw new Error("TinyFish could not be reached. Please try again.");
}

export const findSources = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({ apiKey: key, country: z.string().min(2).max(80), region: z.string().max(80).nullable(), record_type: z.string().max(40), record_type_other: z.string().max(120).nullable() }).parse(d),
  )
  .handler(async ({ data }) => {
    try {
      return await discoverSources(data.apiKey, data);
    } catch (e) {
      fail(e);
    }
  });

export const watchRecord = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ apiKey: key, name: z.string().min(1).max(100), url: z.string().url().max(2000), purpose: z.string().max(2000) }).parse(d))
  .handler(async ({ data }) => {
    try {
      const r = await createMonitor(data.apiKey, data);
      return { id: String(r?.monitor?.id ?? ""), baseline_ok: !(r?.run?.errors?.length > 0) };
    } catch (e) {
      fail(e);
    }
  });

export interface MonitorDTO {
  id: string;
  name: string;
  url: string;
  status: string;
  last_error: string | null;
  updated_at: string | null;
  created_at: string | null;
}

export const getMonitors = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ apiKey: key }).parse(d))
  .handler(async ({ data }): Promise<MonitorDTO[]> => {
    try {
      const r = await listMonitors(data.apiKey);
      return ((r?.monitors ?? []) as any[])
        .filter((m) => m.type === "fetch")
        .map((m) => ({
          id: String(m.id),
          name: String(m.name ?? m.config?.url ?? m.id),
          url: String(m.config?.url ?? ""),
          status: String(m.status ?? "active"),
          last_error: m.last_error ? String(typeof m.last_error === "string" ? m.last_error : JSON.stringify(m.last_error)) : null,
          updated_at: m.updated_at ?? null,
          created_at: m.created_at ?? null,
        }));
    } catch (e) {
      fail(e);
    }
  });

export interface MonitorRunDTO {
  outcome: "changed" | "unchanged" | "baseline" | "unknown";
  relevant: boolean | null;
  summary: string | null;
  diff: string | null;
  errors: string[];
  ran_at: string;
}

export const checkMonitorNow = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ apiKey: key, id: z.string().min(1).max(100) }).parse(d))
  .handler(async ({ data }): Promise<MonitorRunDTO> => {
    try {
      const r = await runMonitor(data.apiKey, data.id);
      const run = r?.run ?? r ?? {};
      const outcome = ["changed", "unchanged", "baseline"].includes(run.outcome) ? run.outcome : run.is_baseline ? "baseline" : "unknown";
      return {
        outcome,
        relevant: run.judgment?.is_relevant ?? null,
        summary: run.judgment?.summary ?? null,
        diff: typeof run.diff === "string" ? run.diff.slice(0, 8000) : null,
        errors: ((run.errors ?? []) as any[]).map((e) => (typeof e === "string" ? e : e?.message ?? JSON.stringify(e))),
        ran_at: new Date().toISOString(),
      };
    } catch (e) {
      fail(e);
    }
  });

export const setMonitorStatus = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ apiKey: key, id: z.string().min(1).max(100), status: z.enum(["active", "paused"]) }).parse(d))
  .handler(async ({ data }) => {
    try {
      await patchMonitor(data.apiKey, data.id, data.status);
      return { ok: true };
    } catch (e) {
      fail(e);
    }
  });

export const removeMonitor = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ apiKey: key, id: z.string().min(1).max(100) }).parse(d))
  .handler(async ({ data }) => {
    try {
      await deleteMonitor(data.apiKey, data.id);
      return { ok: true };
    } catch (e) {
      fail(e);
    }
  });
