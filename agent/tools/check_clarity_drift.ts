import { defineTool } from "eve/tools";
import { z } from "zod";
import { KNOWN_FUNCTIONS, KNOWN_KEYWORDS } from "../knowledge/clarity-baseline";

/**
 * Clarity-drift check: fetch the live Clarity reference pages (docs.stacks.co) and
 * return their text alongside our baked baseline (clarity-baseline.ts), so the agent
 * can report NEW / CHANGED / DEPRECATED built-ins vs our knowledge base.
 *
 * The baseline is import-bundled (always present at runtime, any env). Only the fetch
 * is a runtime dependency. The diff itself is the agent's job (it reads liveText) —
 * robust to docs HTML changes. Report-only: the agent summarizes drift for human
 * review; the human (or the stacks-hacks-research workflow) applies file updates.
 */
const PAGES = ["functions", "keywords", "types"] as const;

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export default defineTool({
  description:
    "Fetch the live Clarity reference (functions/keywords/types) and return it with our baked baseline so you can report drift: NEW, version-CHANGED, or newly-deprecated/removed built-ins. Use for the monthly Clarity-drift check.",
  inputSchema: z.object({
    pages: z
      .array(z.enum(PAGES))
      .default([...PAGES])
      .describe("Which reference pages to fetch."),
    maxCharsPerPage: z.number().int().min(2000).max(200000).default(80000),
  }),
  async execute({ pages, maxCharsPerPage }) {
    const base =
      process.env.STACKS_DOCS_BASE ?? "https://docs.stacks.co/reference/clarity";
    const live: Record<string, { ok: boolean; text?: string; error?: string }> = {};
    for (const page of pages) {
      try {
        const res = await fetch(`${base}/${page}`);
        if (!res.ok) {
          live[page] = { ok: false, error: `fetch ${res.status}` };
          continue;
        }
        live[page] = { ok: true, text: stripHtml(await res.text()).slice(0, maxCharsPerPage) };
      } catch (e) {
        live[page] = { ok: false, error: String(e) };
      }
    }
    return {
      source: base,
      baseline: {
        functions: KNOWN_FUNCTIONS,
        keywords: KNOWN_KEYWORDS,
        functionCount: Object.keys(KNOWN_FUNCTIONS).length,
        keywordCount: Object.keys(KNOWN_KEYWORDS).length,
      },
      live,
      instructions:
        "Compare live page text against baseline (name -> introduced Clarity version). Report: built-ins present live but absent from baseline (NEW), version mismatches (CHANGED), and any 'deprecated'/'removed'/'disabled' notes for baseline entries. Output a concise drift report for human review; do not claim no drift unless every baseline entry was confirmed against the live text.",
    };
  },
});
