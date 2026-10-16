import { connection } from "next/server";
import { SearchPanel } from "./components/search-panel";
import { StatusPill, StatusProvider, VersionText } from "./components/status";

export default async function Home() {
  // Render per request so the search form is server-rendered with the
  // current `?q=` (useSearchParams) instead of a client-only fallback.
  await connection();

  return (
    <StatusProvider>
      <div className="flex flex-1 flex-col">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-5 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <span
                aria-hidden
                className="grid size-10 shrink-0 place-items-center rounded-xl bg-teal-700 text-white shadow-sm"
              >
                <svg
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="size-5"
                >
                  <circle cx="9" cy="9" r="5.5" />
                  <path d="m13.5 13.5 3.5 3.5" strokeLinecap="round" />
                </svg>
              </span>
              <div className="min-w-0">
                <h1 className="text-lg leading-tight font-semibold text-slate-900 sm:text-xl">
                  esa 記事検索
                </h1>
                <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">
                  AppThrust の Knowledge アドオン API で esa の記事を検索します
                </p>
              </div>
            </div>
            <StatusPill />
          </div>
        </header>

        <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 sm:px-6 sm:py-10">
          <SearchPanel />
        </main>

        <footer className="border-t border-slate-200">
          <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center justify-between gap-2 px-4 py-4 text-xs text-slate-500 sm:px-6">
            <span>Powered by AppThrust Knowledge addon</span>
            <span>
              version <VersionText />
            </span>
          </div>
        </footer>
      </div>
    </StatusProvider>
  );
}
