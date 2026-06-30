/**
 * Provisioner — reconciles a contract's MonitoringConfig into live secondlayer CHAIN subscriptions.
 *
 * Desired state = `deriveConfig(contractId).sensitiveFns` (monitoring/kb.ts): one chain
 * `contract_call` trigger per sensitive fn, keyed by a deterministic `ruleKey`
 * (`sentinel:<contractId>:<fn>`) that is BOTH the subscription `name` (how we recognise ours on
 * the account) and the webhook URL path segment (how the bridge resolves the per-sub secret).
 *
 * Reconcile = diff desired vs `subscriptions.list()` (scoped to our prefix + this contract) ->
 * create / update / delete. Idempotent: a second run with no config change is a no-op. Signing
 * secrets are surfaced ONCE on create, so we persist {subId, secret} to the durable sub-store.
 *
 * ⚠️ create/update/delete hit REAL, BILLABLE infra on the account. Dry-run is the DEFAULT; nothing
 * mutates without `--apply`. CHAIN subs need NO subgraph — the chain-trigger surface drives it all.
 *
 * The chain-trigger surface is reached through the `TriggerSource` seam (monitoring/sources/
 * trigger-source.ts), NOT the secondlayer SDK directly — so "powered-by-secondlayer" here is a
 * deliberate, swappable choice (a redundant Chainhook source could slot in without touching this).
 *
 * f043 dogfood: this hand-built N-sub reconciler IS the thing watchlist-provisioning (collapse N
 * creates -> 1) would replace. The N-sub pain is now MEASURED (not just claimed): every full
 * `--apply` records {N, create/update/delete, applyLatencyMs} to provision-metrics; `--metrics`
 * prints the rollup that should drive the f043 go/no-go.
 *
 *   bun run monitoring/provisioner.ts <contractId>                 # dry-run plan (no side effects)
 *   bun run monitoring/provisioner.ts <contractId> --apply         # reconcile all sensitive fns
 *   bun run monitoring/provisioner.ts <contractId> --only execute  # restrict to one fn (MVP)
 *   bun run monitoring/provisioner.ts <contractId> --offboard --apply   # tear down this contract
 *   bun run monitoring/provisioner.ts <contractId> --test execute  # test(id) smoke -> the bridge
 *   bun run monitoring/provisioner.ts --metrics                    # f043 N-sub-pain rollup
 *
 * Env: SECONDLAYER_API_URL (https://api.secondlayer.tools), SECONDLAYER_API_KEY,
 *      BRIDGE_BASE_URL (public https URL of the bridge — required for create/update).
 */
import { deriveConfig } from "./kb";
import { formatRollup, recordDelivery, recordReconcile } from "./provision-metrics";
import { defaultTriggerSource, type TriggerSource } from "./sources/trigger-source";
import {
  deleteRecord,
  getByRuleKey,
  NAME_PREFIX,
  putRecord,
  ruleKeyFor,
  type SubRecord,
} from "./sub-store";

/** One desired subscription, derived from a sensitive fn. */
type Desired = {
  ruleKey: string;
  contractId: string;
  fn: string;
  triggerClass: string;
  url: string;
};

function bridgeBaseUrl(): string {
  const base = process.env.BRIDGE_BASE_URL;
  if (!base) throw new Error("BRIDGE_BASE_URL is required to register a subscription URL");
  return base.replace(/\/+$/, "");
}

/** The desired subscription set for a contract (optionally narrowed to one fn). */
function desiredFor(contractId: string, only?: string): Desired[] {
  const config = deriveConfig(contractId);
  return config.sensitiveFns
    .filter((f) => !only || f.name === only)
    .map((f) => {
      const ruleKey = ruleKeyFor(contractId, f.name);
      return {
        ruleKey,
        contractId,
        fn: f.name,
        triggerClass: f.triggerClass,
        url: `${bridgeBaseUrl()}/${encodeURIComponent(ruleKey)}`,
      };
    });
}

type Plan = {
  create: Desired[];
  update: { desired: Desired; subId: string; fromUrl: string }[];
  delete: { ruleKey: string; subId: string }[];
};

/** Build the create/update/delete plan; deletes are scoped to THIS contract's Sentinel subs. */
async function buildPlan(source: TriggerSource, contractId: string, only?: string): Promise<Plan> {
  const desired = desiredFor(contractId, only);
  const desiredByKey = new Map(desired.map((d) => [d.ruleKey, d]));

  const all = await source.list();
  const ours = all.filter((s) => s.name.startsWith(NAME_PREFIX));
  const remoteByName = new Map(ours.map((s) => [s.name, s]));
  // Only this contract's subs are eligible for deletion (don't touch other clients' subs).
  const contractPrefix = `${NAME_PREFIX}${contractId}:`;

  const plan: Plan = { create: [], update: [], delete: [] };

  for (const d of desired) {
    const remote = remoteByName.get(d.ruleKey);
    if (!remote) plan.create.push(d);
    else if (remote.url !== d.url)
      plan.update.push({ desired: d, subId: remote.id, fromUrl: remote.url });
  }
  for (const s of ours) {
    if (s.name.startsWith(contractPrefix) && !desiredByKey.has(s.name)) {
      plan.delete.push({ ruleKey: s.name, subId: s.id });
    }
  }
  return plan;
}

function printPlan(plan: Plan, apply: boolean): void {
  const tag = apply ? "APPLY" : "DRY-RUN";
  console.log(
    `[provisioner:${tag}] create=${plan.create.length} update=${plan.update.length} delete=${plan.delete.length}`,
  );
  for (const d of plan.create)
    console.log(`  + create  ${d.ruleKey}  contract_call(${d.contractId}, "${d.fn}") -> ${d.url}`);
  for (const u of plan.update)
    console.log(`  ~ update  ${u.desired.ruleKey}  url ${u.fromUrl} -> ${u.desired.url}`);
  for (const x of plan.delete) console.log(`  - delete  ${x.ruleKey}  (${x.subId})`);
  if (!plan.create.length && !plan.update.length && !plan.delete.length)
    console.log("  (no changes — already reconciled)");
}

/** Execute a plan against the live account; persists secrets for created subs. */
async function applyPlan(source: TriggerSource, plan: Plan): Promise<void> {
  for (const d of plan.create) {
    const res = await source.create({
      name: d.ruleKey,
      url: d.url,
      contractId: d.contractId,
      functionName: d.fn,
    });
    const rec: SubRecord = {
      ruleKey: d.ruleKey,
      subId: res.subId,
      signingSecret: res.signingSecret,
      contractId: d.contractId,
      fn: d.fn,
      triggerClass: d.triggerClass,
      url: d.url,
    };
    putRecord(rec);
    console.log(`  + created ${d.ruleKey} -> ${res.subId} (secret stored)`);
  }
  for (const u of plan.update) {
    await source.updateUrl(u.subId, u.desired.url);
    const existing = getByRuleKey(u.desired.ruleKey);
    if (existing) putRecord({ ...existing, url: u.desired.url });
    console.log(`  ~ updated ${u.desired.ruleKey}`);
  }
  for (const x of plan.delete) {
    await source.remove(x.subId);
    deleteRecord(x.ruleKey);
    console.log(`  - deleted ${x.ruleKey}`);
  }
}

/** Tear down every Sentinel subscription for a contract + purge its KV records. */
async function offboard(source: TriggerSource, contractId: string, apply: boolean): Promise<void> {
  const contractPrefix = `${NAME_PREFIX}${contractId}:`;
  const all = await source.list();
  const targets = all.filter((s) => s.name.startsWith(contractPrefix));
  console.log(
    `[provisioner:${apply ? "APPLY" : "DRY-RUN"}] offboard ${contractId} — ${targets.length} subscription(s)`,
  );
  for (const s of targets) {
    console.log(`  - delete ${s.name} (${s.id})`);
    if (apply) {
      await source.remove(s.id);
      deleteRecord(s.name);
    }
  }
}

/** test(id) smoke: send a signed test webhook to the bridge; record the delivery-health metric. */
async function smokeTest(source: TriggerSource, contractId: string, fn: string): Promise<void> {
  const ruleKey = ruleKeyFor(contractId, fn);
  const rec = getByRuleKey(ruleKey);
  if (!rec) throw new Error(`no live subscription for ${ruleKey} — run --apply --only ${fn} first`);
  console.log(`[provisioner] test(${rec.subId}) -> bridge (${rec.url})`);
  const result = await source.test(rec.subId);
  console.log(
    `  test result: ok=${result.ok} status=${result.statusCode} error=${result.error ?? "-"} (${result.durationMs}ms)`,
  );
  const deliveries = await source.recentDeliveries(rec.subId);
  for (const d of deliveries.slice(0, 3)) {
    console.log(
      `  delivery ${d.id}: attempt=${d.attempt} status=${d.statusCode} err=${d.errorMessage ?? "-"}`,
    );
  }
  // rec 5: capture the silent-outage signal — failed/late recent deliveries (null status = no
  // response = a failure).
  const recentFailures = deliveries.filter(
    (d) => d.statusCode == null || d.statusCode < 200 || d.statusCode >= 300,
  ).length;
  recordDelivery({
    ts: new Date().toISOString(),
    ruleKey,
    subId: rec.subId,
    testOk: result.ok,
    testStatus: result.statusCode,
    recentFailures,
    recentTotal: deliveries.length,
  });
}

if (import.meta.main) {
  const argv = process.argv.slice(2);

  // --metrics: print the f043 N-sub-pain rollup and exit (no contractId / no account calls).
  if (argv.includes("--metrics")) {
    console.log(formatRollup());
    process.exit(0);
  }

  const contractId = argv.find((a) => !a.startsWith("--"));
  if (!contractId) {
    console.error(
      "usage: provisioner.ts <contractId> [--apply] [--only <fn>] [--offboard] [--test <fn>]\n" +
        "       provisioner.ts --metrics            # f043 N-sub-pain readout (no account calls)",
    );
    process.exit(1);
  }
  const apply = argv.includes("--apply");
  const onlyIdx = argv.indexOf("--only");
  const only = onlyIdx >= 0 ? argv[onlyIdx + 1] : undefined;
  const testIdx = argv.indexOf("--test");
  const testFn = testIdx >= 0 ? argv[testIdx + 1] : undefined;

  const source = defaultTriggerSource();

  if (testFn) {
    await smokeTest(source, contractId, testFn);
  } else if (argv.includes("--offboard")) {
    await offboard(source, contractId, apply);
  } else {
    const plan = await buildPlan(source, contractId, only);
    printPlan(plan, apply);
    if (apply) {
      const t0 = Date.now();
      await applyPlan(source, plan);
      // rec 5: record the N-sub-pain signal only on a FULL reconcile (`--only` narrows N, which
      // would understate the per-contract footprint f043 cares about).
      if (!only) {
        recordReconcile({
          ts: new Date().toISOString(),
          contractId,
          n: desiredFor(contractId).length,
          created: plan.create.length,
          updated: plan.update.length,
          deleted: plan.delete.length,
          applyLatencyMs: Date.now() - t0,
        });
      }
    } else {
      console.log("  (dry-run — re-run with --apply to make these changes)");
    }
  }
}
