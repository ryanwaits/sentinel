import { useSyncExternalStore } from "react"

// Client-side store for the inline reveal card stack. It is the source of truth
// for what's open; the URL only reflects the top card (for back-button + deep links).
// Cards live here so previous cards survive route changes / cycling.

export type PanelKind = "audit" | "finding"
export interface PanelItem {
  kind: PanelKind
  /** audit: caseId ("zest"). finding: "caseId:findingId" ("zest:F1"). */
  id: string
}

let stack: PanelItem[] = []
const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}
function subscribe(l: () => void) {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}
function getSnapshot() {
  return stack
}

const same = (a: PanelItem, b: PanelItem) => a.kind === b.kind && a.id === b.id

export const panel = {
  /** Push an item to the front. If already open, bring it forward instead of duplicating. */
  open(item: PanelItem) {
    const rest = stack.filter((s) => !same(s, item))
    stack = [...rest, item]
    emit()
  },
  /** Pop only the top card. */
  closeTop() {
    if (!stack.length) return
    stack = stack.slice(0, -1)
    emit()
  },
  /** Carousel through the open cards. +1 = next, -1 = prev. Front is the last element. */
  cycle(dir: 1 | -1) {
    if (stack.length < 2) return
    stack = dir === 1 ? [stack[stack.length - 1], ...stack.slice(0, -1)] : [...stack.slice(1), stack[0]]
    emit()
  },
  /** Reconcile the stack to an exact list (used by URL <-> store sync). No-op if unchanged. */
  setStack(next: PanelItem[]) {
    if (next.length === stack.length && next.every((it, i) => same(it, stack[i]))) return
    stack = next
    emit()
  },
  clear() {
    if (!stack.length) return
    stack = []
    emit()
  },
  get() {
    return stack
  },
}

export function usePanelStack() {
  return useSyncExternalStore(subscribe, getSnapshot)
}

/* ---------- slug <-> item (URL is /log/<slug>) ---------- */
export function slugForItem(item: PanelItem): string {
  return item.kind === "finding" ? item.id.replace(":", ".") : item.id
}
export function itemForSlug(slug: string): PanelItem {
  return slug.includes(".") ? { kind: "finding", id: slug.replace(".", ":") } : { kind: "audit", id: slug }
}
