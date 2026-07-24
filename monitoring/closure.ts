/**
 * Static call-graph dependency-closure resolver.
 *
 * Given a root contract id + a source fetcher, walk the Clarity source for every contract the
 * root's static call graph reaches — `(contract-call? …)` targets, `use-trait` / `impl-trait`
 * references, and any literal contract principal — and recurse, depth-bounded.
 *
 * Why it matters (the proposal-by-indirection hole): a hostile governance proposal usually acts
 * via `(contract-call? M …)` to a SEPARATE deployed contract M. Auditing only the proposal body
 * misses M. The trigger's `audit_targets[]` (M3) = this closure, so M is in scope. The resolver
 * is pure parsing — no chain dependency; the source fetcher is injected (the agent tool wires the
 * real one; tests pass synthetic sources).
 */

// Fully-qualified contract principal: SP/SM/ST/SN + 39 crockford-base32 chars, then `.name`.
// Captures `addr.contract` even inside a trait ref `addr.contract.trait` (we want the contract).
const FQ_REF = /'?(S[A-Z0-9]{38,40})\.([a-z][a-z0-9-]*)/g;
// Local contract sugar `.name` (same deployer), preceded by start / whitespace / `(`.
const LOCAL_REF = /(?:^|[\s(])\.([a-z][a-z0-9-]*)/gm;

/** Strip Clarity line comments so a commented-out ref isn't counted. */
function stripComments(source: string): string {
  return source.replace(/;;[^\n]*/g, "");
}

/**
 * Extract the contract ids referenced by one Clarity source. Local `.name` refs resolve against
 * `deployer` (the root contract's deployer principal). Self-references are dropped by the caller's
 * `seen` set.
 */
export function extractContractRefs(source: string, deployer: string): string[] {
  const code = stripComments(source);
  const refs = new Set<string>();
  for (const m of code.matchAll(FQ_REF)) refs.add(`${m[1]}.${m[2]}`);
  for (const m of code.matchAll(LOCAL_REF)) refs.add(`${deployer}.${m[1]}`);
  return [...refs];
}

export type ClosureEntry = { contractId: string; depth: number; source: string };

/** A source fetcher: returns Clarity source for a contract id, or null if unresolvable. */
export type SourceFetcher = (contractId: string) => Promise<string | null>;

/**
 * Resolve the dependency closure of `rootId`: the root + every contract its static call graph
 * reaches, breadth-first, deduped, bounded by `maxDepth` / `maxContracts`. An unresolvable ref
 * (trait-only principal, undeployed, fetch miss) is skipped, not fatal — partial closure beats
 * none. Returns entries in discovery order (root first).
 */
export async function resolveClosure(
  rootId: string,
  fetchSource: SourceFetcher,
  opts: { maxDepth?: number; maxContracts?: number } = {},
): Promise<ClosureEntry[]> {
  const maxDepth = opts.maxDepth ?? 4;
  const maxContracts = opts.maxContracts ?? 64;
  const seen = new Map<string, ClosureEntry>();
  const queue: Array<{ id: string; depth: number }> = [{ id: rootId, depth: 0 }];

  while (queue.length > 0 && seen.size < maxContracts) {
    const next = queue.shift();
    if (!next) break;
    const { id, depth } = next;
    if (seen.has(id)) continue;
    const source = await fetchSource(id);
    if (source == null) continue; // unresolvable ref — skip, keep walking the rest
    seen.set(id, { contractId: id, depth, source });
    if (depth >= maxDepth) continue;
    const deployer = id.split(".")[0];
    for (const ref of extractContractRefs(source, deployer)) {
      if (!seen.has(ref)) queue.push({ id: ref, depth: depth + 1 });
    }
  }
  return [...seen.values()];
}

/** Just the contract ids of a closure (the `audit_targets[]` list), root first. */
export async function resolveClosureIds(
  rootId: string,
  fetchSource: SourceFetcher,
  opts?: { maxDepth?: number; maxContracts?: number },
): Promise<string[]> {
  return (await resolveClosure(rootId, fetchSource, opts)).map((e) => e.contractId);
}
