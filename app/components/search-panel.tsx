"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type {
  CollectionsResponse,
  HistoryResponse,
  SearchResponse,
} from "@/lib/search-types";
import { getJson, type ApiResult } from "./api";
import {
  SEARCH_MODES,
  TOP_K_OPTIONS,
  modeLabel,
  parseSearchQuery,
  toApiParams,
  toPageParams,
  type SearchQuery,
} from "./search-query";
import {
  HitList,
  NotConfiguredNotice,
  Notice,
  ResultsSkeleton,
  SearchErrorNotice,
  UnavailableNotice,
} from "./search-results";
import { useStatus, type StatusState } from "./status";

type Collection = CollectionsResponse["collections"][number];
type HistoryItem = HistoryResponse["items"][number];

/** Result of one /api/search request, tagged with the request it answers. */
type SearchResult = { key: string; receivedAt: number } & ApiResult<SearchResponse>;

export function SearchPanel() {
  const status = useStatus();
  const searchParams = useSearchParams();
  // The URL is the source of truth for the committed search, so links are
  // shareable and back/forward replay searches.
  const committed = parseSearchQuery(searchParams);
  const committedKey = toApiParams(committed).toString();
  const hasQuery = committed.q !== "";

  // Bumped to re-run a search whose URL did not change (resubmit / retry).
  const [nonce, setNonce] = useState(0);
  const requestKey = `${committedKey}#${nonce}`;

  // Editable form state, re-synced whenever the committed URL changes.
  const [draft, setDraft] = useState<SearchQuery>(committed);
  const [syncedKey, setSyncedKey] = useState(committedKey);
  if (syncedKey !== committedKey) {
    setSyncedKey(committedKey);
    setDraft(committed);
  }

  const [result, setResult] = useState<SearchResult | null>(null);
  const [collections, setCollections] = useState<
    Collection[] | "failed" | null
  >(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const refreshHistory = useCallback(() => {
    getJson<HistoryResponse>("/api/history?limit=10").then((response) => {
      if (response?.ok) setHistory(response.data.items ?? []);
    });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    getJson<CollectionsResponse>("/api/collections", controller.signal).then(
      (response) => {
        if (!response) return;
        // Not configured is already explained by the main notice; only flag
        // real failures next to the chips.
        setCollections(
          response.ok
            ? (response.data.collections ?? [])
            : response.error === "knowledge_not_configured"
              ? []
              : "failed",
        );
      },
    );
    refreshHistory();
    return () => controller.abort();
  }, [refreshHistory]);

  useEffect(() => {
    if (!hasQuery) return;
    // A newer search (or unmount) aborts this one, so stale responses never land.
    const controller = new AbortController();
    getJson<SearchResponse>(`/api/search?${committedKey}`, controller.signal).then(
      (response) => {
        if (!response) return;
        setResult({ key: requestKey, receivedAt: Date.now(), ...response });
        refreshHistory();
      },
    );
    return () => controller.abort();
  }, [hasQuery, committedKey, requestKey, refreshHistory]);

  function commit(next: SearchQuery) {
    const normalized = { ...next, q: next.q.trim() };
    setDraft(normalized);
    const search = toPageParams(normalized).toString();
    const url = search ? `?${search}` : window.location.pathname;
    if (url !== `${window.location.search || window.location.pathname}`) {
      window.history.pushState(null, "", url);
    }
    if (normalized.q === "") {
      inputRef.current?.focus();
    } else if (toApiParams(normalized).toString() === committedKey) {
      setNonce((value) => value + 1);
    }
  }

  // Filter changes re-run the search right away when there is something to search.
  function changeFilters(patch: Partial<SearchQuery>) {
    const next = { ...draft, ...patch };
    if (next.q.trim() !== "") commit(next);
    else setDraft(next);
  }

  function toggleCollection(name: string) {
    const selected = draft.collections.includes(name)
      ? draft.collections.filter((entry) => entry !== name)
      : [...draft.collections, name].sort();
    changeFilters({ collections: selected });
  }

  const loading = hasQuery && result?.key !== requestKey;
  const knownCollections = Array.isArray(collections) ? collections : [];
  // Keep collections selected via a shared URL visible even if not listed.
  const collectionChips = [
    ...knownCollections.map((entry) => entry.name),
    ...draft.collections.filter(
      (name) => !knownCollections.some((entry) => entry.name === name),
    ),
  ];

  return (
    <div className="flex flex-col gap-6">
      <section
        aria-label="検索"
        className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-900/[0.03] sm:p-5"
      >
        <form
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            commit(draft);
          }}
          className="flex flex-col gap-2 sm:flex-row"
        >
          <label htmlFor="esa-search-q" className="sr-only">
            検索語
          </label>
          <div className="relative flex-1">
            <svg
              aria-hidden
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-slate-400"
            >
              <circle cx="9" cy="9" r="5.5" />
              <path d="m13.5 13.5 3.5 3.5" strokeLinecap="round" />
            </svg>
            <input
              ref={inputRef}
              id="esa-search-q"
              type="search"
              name="q"
              autoFocus
              autoComplete="off"
              enterKeyHint="search"
              placeholder="キーワードや質問文で esa の記事を検索"
              value={draft.q}
              onChange={(event) =>
                setDraft({ ...draft, q: event.target.value })
              }
              className="h-12 w-full rounded-xl border border-slate-300 bg-white pr-3 pl-11 text-base text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:ring-4 focus:ring-teal-600/15 focus:outline-none"
            />
          </div>
          <button
            type="submit"
            aria-busy={loading}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-teal-700 px-6 text-sm font-semibold text-white transition-colors hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:opacity-60"
          >
            {loading ? (
              <span
                aria-hidden
                className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
              />
            ) : null}
            {loading ? "検索中…" : "検索"}
          </button>
        </form>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <fieldset className="flex min-w-0 items-center gap-2">
            <legend className="sr-only">検索モード</legend>
            <div className="inline-flex rounded-lg bg-slate-100 p-0.5">
              {SEARCH_MODES.map((entry) => (
                <label key={entry.value} className="relative">
                  <input
                    type="radio"
                    name="mode"
                    value={entry.value}
                    checked={draft.mode === entry.value}
                    onChange={() => changeFilters({ mode: entry.value })}
                    className="peer sr-only"
                  />
                  <span className="block cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors peer-checked:bg-white peer-checked:text-slate-900 peer-checked:shadow-sm peer-focus-visible:outline-2 peer-focus-visible:outline-teal-600 hover:text-slate-900">
                    {entry.label}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <label className="flex items-center gap-2 text-xs text-slate-600">
            表示件数
            <select
              value={draft.topK}
              onChange={(event) =>
                changeFilters({ topK: Number(event.target.value) })
              }
              className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-900 focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15 focus:outline-none"
            >
              {TOP_K_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  {value} 件
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-3 border-t border-slate-100 pt-3">
          <div
            role="group"
            aria-label="コレクションで絞り込み"
            className="flex flex-wrap items-center gap-1.5"
          >
            <span className="mr-1 text-xs text-slate-500">コレクション</span>
            <FilterChip
              pressed={draft.collections.length === 0}
              onClick={() => changeFilters({ collections: [] })}
            >
              すべて
            </FilterChip>
            {collectionChips.map((name) => (
              <FilterChip
                key={name}
                pressed={draft.collections.includes(name)}
                onClick={() => toggleCollection(name)}
                title={
                  knownCollections.find((entry) => entry.name === name)
                    ?.description || undefined
                }
              >
                {name}
              </FilterChip>
            ))}
            {collections === null ? (
              <span
                aria-hidden
                className="h-6 w-20 animate-pulse rounded-full bg-slate-100"
              />
            ) : null}
            {collections === "failed" ? (
              <span className="text-xs text-slate-400">
                コレクション一覧を取得できませんでした
              </span>
            ) : null}
          </div>
        </div>

        {history.length > 0 ? (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs text-slate-500">最近の検索</span>
            {history.map((item) => (
              <button
                key={item.query}
                type="button"
                onClick={() => commit({ ...draft, q: item.query })}
                title={`${item.count} 回検索`}
                className="max-w-full truncate rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700 transition-colors hover:border-teal-300 hover:bg-teal-50 hover:text-teal-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 sm:max-w-64"
              >
                {item.query}
              </button>
            ))}
          </div>
        ) : null}
      </section>

      <section aria-label="検索結果" aria-busy={loading}>
        {!hasQuery ? (
          <IdleState status={status} />
        ) : loading && !(result?.ok && result.data.hits.length > 0) ? (
          <ResultsSkeleton />
        ) : result && !result.ok ? (
          <div className="flex flex-col gap-3">
            <p role="status" className="px-1 text-xs text-slate-500">
              「
              <span className="font-medium text-slate-700">{committed.q}</span>
              」を検索できませんでした
            </p>
            <SearchErrorNotice
              error={result.error}
              status={result.status}
              message={result.message}
              onRetry={() => setNonce((value) => value + 1)}
            />
          </div>
        ) : result?.ok ? (
          <div
            className={`flex flex-col gap-3 transition-opacity ${loading ? "opacity-50" : ""}`}
          >
            <p role="status" className="px-1 text-xs text-slate-500">
              <span className="font-medium text-slate-700">
                {result.data.hits.length} 件
              </span>
              <span className="mx-1.5 text-slate-300">·</span>
              {modeLabel(result.data.mode)}
              <span className="mx-1.5 text-slate-300">·</span>
              {result.data.tookMs} ms
            </p>
            {result.data.hits.length > 0 ? (
              <HitList
                hits={result.data.hits}
                query={result.data.query}
                now={result.receivedAt}
              />
            ) : (
              <Notice
                tone="info"
                title={`「${result.data.query}」に一致する記事は見つかりませんでした`}
              >
                <p>
                  別のキーワードを試すか、検索モードを切り替える、またはコレクションの絞り込みを外してみてください。
                </p>
              </Notice>
            )}
          </div>
        ) : null}
      </section>
    </div>
  );
}

function FilterChip({
  pressed,
  onClick,
  title,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      title={title}
      className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 ${
        pressed
          ? "border-teal-700 bg-teal-700 text-white"
          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900"
      }`}
    >
      {children}
    </button>
  );
}

function IdleState({ status }: { status: StatusState }) {
  if (status === "failed") {
    return (
      <UnavailableNotice detail="アプリの状態（/api/status）を取得できませんでした。" />
    );
  }
  if (status?.knowledge === "not-configured") return <NotConfiguredNotice />;
  if (status?.knowledge === "unavailable") return <UnavailableNotice />;
  return (
    <div className="rounded-xl border border-dashed border-slate-300 px-5 py-10 text-center text-sm text-slate-500">
      <p className="font-medium text-slate-700">esa の記事を横断検索できます</p>
      <p className="mt-1">
        キーワード検索と意味の近さによるベクトル検索を組み合わせて、関連する記事の段落を探します。
      </p>
    </div>
  );
}
