"use client";

import { createContext, use, useEffect, useState } from "react";
import type { StatusResponse } from "@/lib/search-types";
import { getJson } from "./api";

/** `null` while loading; `"failed"` when /api/status itself could not be read. */
export type StatusState = StatusResponse | "failed" | null;

const StatusContext = createContext<StatusState>(null);

export function StatusProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<StatusState>(null);

  useEffect(() => {
    const controller = new AbortController();
    getJson<StatusResponse>("/api/status", controller.signal).then((result) => {
      if (result) setStatus(result.ok ? result.data : "failed");
    });
    return () => controller.abort();
  }, []);

  return <StatusContext value={status}>{children}</StatusContext>;
}

export function useStatus(): StatusState {
  return use(StatusContext);
}

const PILL = {
  loading: {
    label: "確認中",
    tone: "border-slate-200 bg-white text-slate-500",
    dot: "bg-slate-300 animate-pulse",
  },
  ready: {
    label: "接続済み",
    tone: "border-emerald-200 bg-emerald-50 text-emerald-800",
    dot: "bg-emerald-500",
  },
  "not-configured": {
    label: "未接続",
    tone: "border-amber-200 bg-amber-50 text-amber-800",
    dot: "bg-amber-500",
  },
  unavailable: {
    label: "利用不可",
    tone: "border-rose-200 bg-rose-50 text-rose-800",
    dot: "bg-rose-500",
  },
} as const;

export function StatusPill() {
  const status = useStatus();
  const pill =
    status === null
      ? PILL.loading
      : status === "failed"
        ? PILL.unavailable
        : PILL[status.knowledge];
  const publicUrl = status !== null && status !== "failed" ? status.publicUrl : null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span
        role="status"
        className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${pill.tone}`}
      >
        <span aria-hidden className={`size-2 rounded-full ${pill.dot}`} />
        <span>
          <span className="sr-only">Knowledge の状態: </span>
          {pill.label}
        </span>
      </span>
      {publicUrl ? (
        <a
          href={publicUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 transition-colors hover:border-teal-300 hover:text-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"
        >
          Knowledge を開く
          <span aria-hidden>↗</span>
        </a>
      ) : null}
    </div>
  );
}

export function VersionText() {
  const status = useStatus();
  const version =
    status !== null && status !== "failed" ? status.version : "—";
  return <span className="font-mono text-slate-600">{version}</span>;
}
