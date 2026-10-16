"use client";

import { useId, useState } from "react";
import type { SearchHit } from "@/lib/search-types";

const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 60 * 60],
  ["month", 30 * 24 * 60 * 60],
  ["week", 7 * 24 * 60 * 60],
  ["day", 24 * 60 * 60],
  ["hour", 60 * 60],
  ["minute", 60],
];

const relativeFormat = new Intl.RelativeTimeFormat("ja", { numeric: "auto" });
const absoluteFormat = new Intl.DateTimeFormat("ja-JP", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatRelative(iso: string, now: number): string | null {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return null;
  const seconds = Math.round((time - now) / 1000);
  for (const [unit, size] of RELATIVE_UNITS) {
    if (Math.abs(seconds) >= size) {
      return relativeFormat.format(Math.trunc(seconds / size), unit);
    }
  }
  return "たった今";
}

/** Splits `text` so that every whitespace-separated query term is wrapped in <mark>. */
function highlight(text: string, query: string): React.ReactNode {
  const terms = query
    .split(/\s+/)
    .filter((term) => term.length > 0)
    .map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (terms.length === 0) return text;
  const pattern = new RegExp(`(${terms.join("|")})`, "gi");
  return text.split(pattern).map((part, index) =>
    index % 2 === 1 ? (
      <mark key={index} className="rounded-sm bg-amber-100 px-0.5 text-inherit">
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

export function HitList({
  hits,
  query,
  now,
}: {
  hits: SearchHit[];
  query: string;
  /** Epoch ms when the results arrived; anchors relative timestamps. */
  now: number;
}) {
  return (
    <ol className="flex flex-col gap-3">
      {hits.map((hit) => (
        <li key={`${hit.documentId}:${hit.chunkIndex}`}>
          <HitCard hit={hit} query={query} now={now} />
        </li>
      ))}
    </ol>
  );
}

function HitCard({
  hit,
  query,
  now,
}: {
  hit: SearchHit;
  query: string;
  now: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const snippetId = useId();
  const meta = hit.metadata;
  const category = meta?.category?.split("/").filter(Boolean) ?? [];
  const tags = meta?.tags?.filter(Boolean) ?? [];
  const updated = meta?.updatedAt ? formatRelative(meta.updatedAt, now) : null;
  const collapsible =
    hit.text.length > 160 || hit.text.split("\n").length > 3;

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-900/[0.02] transition-colors hover:border-slate-300 sm:p-5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
        <span className="rounded-md bg-teal-50 px-1.5 py-0.5 font-medium text-teal-800 ring-1 ring-teal-100 ring-inset">
          {hit.collection}
        </span>
        {meta?.number !== undefined ? (
          <span className="font-mono text-slate-500">#{meta.number}</span>
        ) : null}
        {category.length > 0 ? (
          <span className="flex min-w-0 flex-wrap items-center gap-1">
            {category.map((segment, index) => (
              <span key={index} className="flex items-center gap-1">
                {index > 0 ? (
                  <span aria-hidden className="text-slate-300">
                    /
                  </span>
                ) : null}
                <span className="text-slate-600">{segment}</span>
              </span>
            ))}
          </span>
        ) : null}
      </div>

      <h3 className="mt-2 text-base leading-snug font-semibold text-slate-900 sm:text-lg">
        <a
          href={hit.url}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-sm break-words underline-offset-4 hover:text-teal-800 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"
        >
          {hit.title || "（無題）"}
          <span aria-hidden className="ml-1 text-sm text-slate-400">
            ↗
          </span>
          <span className="sr-only">（新しいタブで開く）</span>
        </a>
      </h3>

      <p
        id={snippetId}
        className={`mt-2 text-sm leading-relaxed break-words whitespace-pre-line text-slate-700 ${
          expanded ? "" : "line-clamp-3"
        }`}
      >
        {highlight(hit.text, query)}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-slate-500">
        {collapsible ? (
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={snippetId}
            onClick={() => setExpanded((value) => !value)}
            className="rounded-sm font-medium text-teal-700 hover:text-teal-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"
          >
            {expanded ? "折りたたむ" : "続きを表示"}
          </button>
        ) : null}
        {tags.length > 0 ? (
          <ul className="flex flex-wrap gap-1" aria-label="タグ">
            {tags.map((tag) => (
              <li
                key={tag}
                className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600"
              >
                #{tag}
              </li>
            ))}
          </ul>
        ) : null}
        <span className="ml-auto flex items-center gap-3">
          {updated && meta?.updatedAt ? (
            <time
              dateTime={meta.updatedAt}
              title={absoluteFormat.format(new Date(meta.updatedAt))}
            >
              {updated}に更新
            </time>
          ) : null}
          <span className="font-mono text-[11px] text-slate-400" title="スコア">
            {hit.score.toFixed(3)}
          </span>
        </span>
      </div>
    </article>
  );
}

export function ResultsSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-hidden>
      {[0, 1, 2].map((index) => (
        <div
          key={index}
          className="animate-pulse rounded-xl border border-slate-200 bg-white p-5"
        >
          <div className="h-3 w-24 rounded bg-slate-100" />
          <div className="mt-3 h-4 w-2/3 rounded bg-slate-200" />
          <div className="mt-3 h-3 w-full rounded bg-slate-100" />
          <div className="mt-2 h-3 w-5/6 rounded bg-slate-100" />
        </div>
      ))}
    </div>
  );
}

type NoticeTone = "info" | "warning" | "danger";

const NOTICE_TONES: Record<NoticeTone, string> = {
  info: "border-slate-200 bg-white text-slate-700",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  danger: "border-rose-200 bg-rose-50 text-rose-900",
};

export function Notice({
  tone,
  title,
  children,
  action,
}: {
  tone: NoticeTone;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div
      role={tone === "info" ? undefined : "alert"}
      className={`rounded-xl border p-5 ${NOTICE_TONES[tone]}`}
    >
      <p className="text-sm font-semibold">{title}</p>
      {children ? (
        <div className="mt-2 space-y-2 text-sm leading-relaxed opacity-90">
          {children}
        </div>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

const ENV_NAMES = ["KNOWLEDGE_URL", "KNOWLEDGE_API_KEY", "KNOWLEDGE_ACCESS_URL"];

export function NotConfiguredNotice() {
  return (
    <Notice tone="warning" title="Knowledge アドオンに接続されていません">
      <p>
        このアプリには Project の Knowledge アドオンへの接続（Access Key
        による ComponentConnection）がまだ設定されていないため、検索できません。
      </p>
      <p>
        AppThrust でこのアプリから Knowledge アドオンへの接続を追加すると、
        {ENV_NAMES.map((name, index) => (
          <span key={name}>
            {index > 0 ? "・" : null}
            <code className="rounded bg-amber-100/70 px-1 font-mono text-xs">
              {name}
            </code>
          </span>
        ))}
        が注入され、再デプロイ後に検索できるようになります。
      </p>
    </Notice>
  );
}

export function UnavailableNotice({
  detail,
  action,
}: {
  detail?: string | null;
  action?: React.ReactNode;
}) {
  return (
    <Notice
      tone="danger"
      title="Knowledge アドオンを利用できません"
      action={action}
    >
      <p>
        接続は設定されていますが、アクセストークンの取得または Knowledge API
        の呼び出しに失敗しました。アドオンが起動しているか、Access Key
        が有効かを確認し、しばらくしてから再試行してください。
      </p>
      {detail ? (
        <p className="font-mono text-xs break-words opacity-80">{detail}</p>
      ) : null}
    </Notice>
  );
}

export function SearchErrorNotice({
  error,
  status,
  message,
  onRetry,
}: {
  error: string;
  status: number;
  message: string | null;
  onRetry: () => void;
}) {
  const retry = (
    <button
      type="button"
      onClick={onRetry}
      className="rounded-lg border border-current/20 bg-white/70 px-3 py-1.5 text-sm font-medium hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
    >
      再試行
    </button>
  );

  switch (error) {
    case "knowledge_not_configured":
      return <NotConfiguredNotice />;
    case "knowledge_unavailable":
      return <UnavailableNotice detail={message} action={retry} />;
    case "key_not_permitted":
      return (
        <Notice tone="warning" title="このアクセスキーでは検索できません">
          <p>
            Knowledge アドオンがこのアプリの Access Key
            による検索を許可していません。接続に使っている Access Key
            の権限（スコープ）を確認してください。
          </p>
        </Notice>
      );
    case "query_required":
      return <Notice tone="info" title="検索語を入力してください" />;
    default:
      return (
        <Notice tone="danger" title="検索に失敗しました" action={retry}>
          <p>
            {error === "network"
              ? "サーバーに接続できませんでした。ネットワークを確認して再試行してください。"
              : "予期しないエラーが発生しました。時間をおいて再試行してください。"}
          </p>
          <p className="font-mono text-xs break-words opacity-80">
            {status > 0 ? `HTTP ${status} · ` : null}
            {error}
            {message ? ` · ${message}` : null}
          </p>
        </Notice>
      );
  }
}
