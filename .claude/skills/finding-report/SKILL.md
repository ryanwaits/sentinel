---
name: finding-report
description: Write an audit or monitoring finding in Sentinel's house voice — terse, trusted-colleague, proof-forward. Use when writing up a confirmed finding for a disclosure, a bounty submission, a client report, or a monitoring alert. Triggers on "write up this finding", "draft the report", "disclosure report", "finding summary", "the report reads like AI".
---

# Finding report

Sentinel's report voice. Its whole reason to exist: a comprehensive, exhaustively-structured
write-up **reads as AI-generated** and gets closed unread — Hermetica closed a real, reproducible
finding as "AI Report" in two minutes without running the PoC. The proof is the credibility engine.
The prose is a colleague's summary that gets out of its way.

**The one job:** cut the prose ~80% versus a "thorough audit write-up," keep the proof precise, and
sound like a sharp colleague telling you what they found, not a report generator.

## When to use
- **Audit finding** — a confirmed finding for disclosure, a bounty submission, or a client report.
- **Monitoring alert** — a trigger/incident surfaced something; a human needs to act (human-gated).

Both share the voice below. Only the shape differs (see the two templates).

## Voice — trusted colleague
- **Open with what's broken.** No preamble, no "During our review of…". First sentence names the bug.
- **Plain words over jargon.** "The user's funds get stuck" not "denial of access to principal."
  "gets stuck" not "liveness-impacting." Say it how you'd say it out loud to a teammate.
- **Let the code carry the mechanism.** One line of context per snippet, then the snippet. Don't
  narrate what the reader can see in three lines of Clarity.
- **State severity in a clause, name the one caveat, move on.** No multi-paragraph severity essay.
  If there's a mitigation, it's a sentence — "an operator can unstick it, but not during a shortfall."
- **No hedging, no throat-clearing.** Cut "we would note that", "it is worth mentioning", "in order to".
  One honest caveat beats five defensive ones.
- **Active voice, present tense.** "cancel-redeem rejects express claims" not "express claims are rejected."

## Keep thorough — the proof is data, not prose
This part does NOT get cut. It gets tightened into data a reader can act on in seconds:
- Exact contract id, exact function, exact error codes — verbatim.
- The runnable command + its expected result on one line.
- The minimal code snippet(s) that show the bug — verbatim, only the lines that matter.
- The control / positive result (what proves it's the bug and not the harness).
- The fix as one line naming the exact change.

A reader should be able to run the proof without reading a paragraph about it.

## Cut the 80% — delete on sight
- The numbered multi-point "Vulnerability Details" walkthrough → 2–3 sentences + the snippet.
- The severity/duration essay → one line + one caveat clause.
- The "not a known issue" audit cross-reference essay → one line (or a link).
- The scope essay → one line.
- The phase-by-phase PoC narration → the run command + a 3–4 bullet "what it proves."
- Restated headings, framing repeated across sections, anything a reader already knows.

## Audit finding — template
```
**<one-line: what's broken, plainly>**
<contract-id> · <impact, in scope terms> · <severity>

<2–4 sentences: how it happens and who it hurts. The sharpest real-world trigger. No attacker
if there's no attacker — say so.>

```clarity
<only the lines that show the bug, with err codes inline>
```

**Proof** (<substrate: mainnet fork / airgapped>, nothing broadcast):
```
<run command>   →   <result, e.g. 21/21, exit 0>
```
- <what step 1 shows — exact codes>
- <the discriminating step — e.g. still fails after cooldown>
- <the control — same contract, one thing changed, recovers>

**Fix:** <one line, the exact change>.

<optional single line: prior-art / scope note if it matters>
```

## Monitoring alert — template
Even terser. A human is being paged; respect their time.
```
**<what fired, plainly>** · <contract-id> · <alertLevel>
<1–2 sentences: what happened on-chain and why it matters. Correlated to which known finding, if any.>
Check: <the one thing to look at>.  ·  Suggested: <the human-gated action>.
```
Honesty rules still bind: a signature match is a **correlation**, not a confirmed exploit — say
"looks like" not "is". Never state or imply an automatic action was taken.

## Anti-patterns (a report has failed if)
- It opens with context instead of the finding.
- A reader must read prose to understand the impact — it wasn't in the first two lines.
- The severity discussion is longer than the finding.
- It explains at length what the bug is *not*.
- It reads as exhaustive rather than sharp — the tell that gets it closed as AI.
- The proof got shortened along with the prose. (The proof stays complete; only the prose is cut.)

## Calibration — Hermetica #V2, before → after
**Before:** ~150 lines. Brief/Intro paragraph, 6-point Vulnerability Details, multi-paragraph Impact +
severity/duration essay + not-a-known-issue essay, 7-phase PoC narration. Closed as "AI Report" in 2 min.

**After (~25 lines, this skill's output):**
```
**hBTC: express redeemers can get their funds stuck.**
SP1S1HSFH0SQQGWKB69EYFNY0B1MHRMGXR3J1FH4D.vault-hbtc-v1-2 · temporary freezing of funds · High

If a user withdraws with the express option and the claim is never funded, they're stuck:
cancel-redeem rejects express claims, and redeem needs a funded claim. Their hBTC sits in the vault
with no way out. No attacker — they just picked express at the wrong time. It bites hardest during a
reserve shortfall, when funding reverts for everyone: regular redeemers cancel and walk, express can't.

​```clarity
;; cancel-redeem — already unfunded-only, then bars express anyway
(asserts! (is-none (get assets claim)) ERR_ALREADY_FUNDED)
(asserts! (not (get is-express claim)) ERR_NOT_ALLOWED)   ;; u103009
;; redeem needs assets, which only the operator sets
(unwrap! (get assets claim) ERR_NOT_FUNDED)               ;; u103006
​```

**Proof** (mainnet fork, real holder, nothing broadcast):
​```
bun install && bun run poc/hermetica-v2-express-lock-fork.ts   →   21/21, exit 0
​```
- express claim → cancel-redeem u103009, redeem u103006, shares stuck
- 500 blocks later, past the cooldown: same two errors — not a cooldown
- control: same contract, is-express=false → cancel succeeds, 100% recovered

**Fix:** drop the express bar on the *unfunded* cancel path (the is-none assert above already makes it
safe), or gate it behind an expiry window.

Not in either published audit — both predate this contract.
```

## This is the product's voice, not a one-off
Whatever writes a Sentinel finding — a human here, or the audit engine's report layer — uses this
skill's voice. The engine emits structured findings (`monitoring/adjudication.ts` `Finding`); the
report is the prose rendering of one, and it renders like the "after" above. Keep them consistent so a
client can't tell whether a person or the engine wrote it — both sound like the sharp colleague.
