"use client";

import type { Element, ElementContent, Root, RootContent, Text } from "hast";
import { memo, useLayoutEffect, useState, type RefObject } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Builds a case-insensitive matcher for the whitespace-separated query terms. */
export function termPattern(query: string): RegExp | null {
  const terms = query
    .split(/\s+/)
    .filter((term) => term.length > 0)
    .map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return terms.length > 0 ? new RegExp(`(${terms.join("|")})`, "gi") : null;
}

/** Elements whose text is literal (code) and must never receive highlight marks. */
const LITERAL_TAGS: Record<string, true> = { code: true, pre: true, kbd: true, samp: true };
const HEADING = /^h([1-6])$/;
const URL_TEXT = /^(?:https?:\/\/|mailto:|www\.)/i;

/** Autolinks (`https://…`, bare emails) display their URL; it is not prose. */
function isUrlLink(node: Element): boolean {
  const text = textOf(node).trim();
  const href = String(node.properties.href ?? "");
  return URL_TEXT.test(text) || href === text || href === `mailto:${text}`;
}

function textOf(node: Element): string {
  return node.children
    .map((child) =>
      child.type === "text" ? child.value : child.type === "element" ? textOf(child) : "",
    )
    .join("");
}

function markTerms(value: string, pattern: RegExp): ElementContent[] {
  return value.split(pattern).flatMap((part, index): ElementContent[] => {
    if (part === "") return [];
    const text: Text = { type: "text", value: part };
    return index % 2 === 1
      ? [{ type: "element", tagName: "mark", properties: {}, children: [text] }]
      : [text];
  });
}

/**
 * Adapts esa Markdown for a result card:
 * - headings shift below the card title (h3) so the page outline stays intact;
 * - images become links (esa image URLs need an authenticated session);
 * - links open in a new tab without an opener;
 * - tables get a horizontally scrollable wrapper;
 * - query terms are wrapped in <mark> in prose text only — never inside code,
 *   attributes (URLs), or autolinked URL text.
 */
function rehypeSnippet({ pattern }: { pattern: RegExp | null }) {
  function visit(parent: { children: RootContent[] }, insideLink: boolean) {
    const next: RootContent[] = [];
    for (const child of parent.children) {
      if (child.type === "text") {
        next.push(...(pattern ? markTerms(child.value, pattern) : [child]));
        continue;
      }
      if (child.type !== "element") {
        next.push(child);
        continue;
      }

      let node: Element = child;
      if (node.tagName === "img") {
        const alt = typeof node.properties.alt === "string" ? node.properties.alt : "";
        const label: Text = { type: "text", value: alt ? `画像: ${alt}` : "画像" };
        node = insideLink
          ? { type: "element", tagName: "span", properties: {}, children: [label] }
          : {
              type: "element",
              tagName: "a",
              properties: { href: node.properties.src, className: ["snippet-image-link"] },
              children: [label],
            };
      }

      const heading = HEADING.exec(node.tagName);
      if (heading) node.tagName = `h${Math.min(6, Number(heading[1]) + 3)}`;

      if (node.tagName === "a") {
        node.properties.target = "_blank";
        node.properties.rel = ["noopener", "noreferrer"];
      }

      const literal =
        LITERAL_TAGS[node.tagName] === true || (node.tagName === "a" && isUrlLink(node));
      if (!literal) visit(node, insideLink || node.tagName === "a");

      next.push(
        node.tagName === "table"
          ? {
              type: "element",
              tagName: "div",
              properties: { className: ["snippet-table"] },
              children: [node],
            }
          : node,
      );
    }
    parent.children = next;
  }

  return (tree: Root) => visit(tree, false);
}

/** Renders a Knowledge hit chunk (esa Markdown) with query-term highlighting. Raw HTML is shown as text. */
export const SnippetMarkdown = memo(function SnippetMarkdown({
  text,
  pattern,
  idPrefix,
}: {
  text: string;
  pattern: RegExp | null;
  /** Unique per card so footnote ids do not collide between results. */
  idPrefix: string;
}) {
  return (
    <Markdown
      remarkPlugins={[remarkGfm]}
      remarkRehypeOptions={{ clobberPrefix: `${idPrefix}-`, footnoteLabel: "脚注" }}
      rehypePlugins={[[rehypeSnippet, { pattern }]]}
    >
      {text}
    </Markdown>
  );
});

/** Rendered height (px) a collapsed snippet may occupy. */
const COLLAPSED_HEIGHT = 168;
/** Content up to this much taller than the collapsed height is shown in full. */
const COLLAPSE_SLACK = 48;
/** Blocks that are never cut through; the clamp ends above them instead. */
const ATOMIC_BLOCKS: Record<string, true> = { PRE: true, TABLE: true, HR: true };

export type SnippetClamp =
  /** Before the first layout measurement: provisional cap, no affordance yet. */
  | { state: "measuring" }
  | { state: "fits" }
  /** `faded` when the cut runs through flowing text and needs a fade-out. */
  | { state: "clamped"; height: number; faded: boolean };

export const PROVISIONAL_HEIGHT = COLLAPSED_HEIGHT + COLLAPSE_SLACK;

function measureClamp(content: HTMLElement): SnippetClamp {
  const box = content.getBoundingClientRect();
  if (box.height <= PROVISIONAL_HEIGHT) return { state: "fits" };

  let cut = 0;
  for (const block of Array.from(content.children) as HTMLElement[]) {
    const rect = block.getBoundingClientRect();
    const bottom = rect.bottom - box.top;
    if (bottom <= COLLAPSED_HEIGHT) {
      cut = bottom;
      continue;
    }
    const atomic =
      ATOMIC_BLOCKS[block.tagName] === true || block.classList.contains("snippet-table");
    if (rect.top - box.top >= COLLAPSED_HEIGHT || (atomic && cut > 0)) {
      return { state: "clamped", height: Math.ceil(cut), faded: false };
    }
    // Flowing text (or an oversized leading table/code block) is cut at the cap and faded out.
    return { state: "clamped", height: COLLAPSED_HEIGHT, faded: true };
  }
  return { state: "clamped", height: Math.ceil(cut), faded: false };
}

/**
 * Measures the rendered snippet and decides where the collapsed view ends:
 * on a block boundary when the next block is a table/code block/rule (so a
 * collapsed card never shows part of one), otherwise at a fixed height with
 * a fade. Re-measures when the content reflows (viewport width changes).
 */
export function useSnippetClamp(contentRef: RefObject<HTMLElement | null>): SnippetClamp {
  const [clamp, setClamp] = useState<SnippetClamp>({ state: "measuring" });

  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    const observer = new ResizeObserver(() => {
      const next = measureClamp(content);
      setClamp((prev) =>
        prev.state === next.state &&
        (prev.state !== "clamped" ||
          (next.state === "clamped" &&
            prev.height === next.height &&
            prev.faded === next.faded))
          ? prev
          : next,
      );
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, [contentRef]);

  return clamp;
}
