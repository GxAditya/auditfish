// Browser-only storage helpers. Call only from effects or event handlers.
import { useEffect, useState, useCallback } from "react";
import type { SourceInfo, VerificationResult, VerifiedRecord } from "./verification";

const KEY = "auditfish.tinyfish_key";
const HISTORY = "auditfish.history";
const SNAPSHOTS = "auditfish.snapshots";
const EVT = "auditfish:key";

export function useApiKey() {
  const [apiKey, setKey] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const read = () => setKey(localStorage.getItem(KEY));
    read();
    setReady(true);
    window.addEventListener(EVT, read);
    return () => window.removeEventListener(EVT, read);
  }, []);
  const save = useCallback((k: string | null) => {
    if (k) localStorage.setItem(KEY, k.trim());
    else localStorage.removeItem(KEY);
    window.dispatchEvent(new Event(EVT));
  }, []);
  return { apiKey, ready, save };
}

export interface HistoryItem {
  id: string;
  saved_at: string;
  result: VerificationResult;
}

export function loadHistory(): HistoryItem[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY) ?? "[]");
  } catch {
    return [];
  }
}
export function addHistory(result: VerificationResult) {
  const items = loadHistory();
  items.unshift({ id: crypto.randomUUID(), saved_at: new Date().toISOString(), result });
  localStorage.setItem(HISTORY, JSON.stringify(items.slice(0, 30)));
}
export function clearHistory() {
  localStorage.removeItem(HISTORY);
}

export interface Snapshot {
  monitor_id: string;
  record: VerifiedRecord;
  previous?: VerifiedRecord;
  last_run?: { outcome: string; relevant: boolean | null; summary: string | null; ran_at: string; diff: string | null };
  query: VerificationResult["query"];
  /** Registry the record came from, so the watchlist can re-run the live agent check. */
  source?: SourceInfo | undefined;
}
export function loadSnapshots(): Record<string, Snapshot> {
  try {
    return JSON.parse(localStorage.getItem(SNAPSHOTS) ?? "{}");
  } catch {
    return {};
  }
}
export function saveSnapshot(s: Snapshot) {
  const all = loadSnapshots();
  all[s.monitor_id] = s;
  localStorage.setItem(SNAPSHOTS, JSON.stringify(all));
}
export function deleteSnapshot(id: string) {
  const all = loadSnapshots();
  delete all[id];
  localStorage.setItem(SNAPSHOTS, JSON.stringify(all));
}
