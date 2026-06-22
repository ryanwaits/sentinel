# Backlog

Deferred, non-pressing items. Capture enough context to pick up later.

## Incident-sweep automation (deferred 2026-06-21)
**Status:** not pressing. Clarity-drift half is automated (eve monthly schedule +
`check_clarity_drift`). The incident half is **manual for now** — run the Claude Code
`stacks-hacks-research` workflow on demand to refresh the incident corpus.

**What's left to decide / build:**
- How the monthly incident sweep should run automatically. Options considered:
  1. **Claude Code routine** (recommended) — schedule the `stacks-hacks-research`
     workflow monthly; it can read+write repo files and produces verified, sourced
     entries. No new vendor. (Set up via the `/schedule` skill.)
  2. **Anthropic native web search in eve** — a server-side provider tool through the
     Vercel AI Gateway. Plausible (eve's dist references `provider-defined` /
     `server_tool` / `anthropic.web`), but unproven through `@ai-sdk/gateway`
     (`@ai-sdk/anthropic` is not installed) and lower quality than the workflow for
     verified research.
  3. ~~Tavily / third-party search API~~ — rejected: don't want another service to manage.

**Context:** the `web_search` eve tool (Tavily-based) was removed. Deep, adversarially
-verified incident research already lives in the Claude Code workflow — that's the
better engine; the open question is only how to *schedule* it.

**When picked up:** lean toward option 1; confirm the routine can invoke the workflow
and apply file updates (PR), then drop this item.
