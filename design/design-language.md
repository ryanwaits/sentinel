# Sentinel — design language

The canonical reference for the control-plane UI. Visual system derived from **Warp** (warp.co, real
tokens extracted 2026-07-01); voice/positioning borrowed from **Datadog** (the *how they communicate*,
not their visual design).

## Positioning (Datadog-style category framing)
Datadog frames itself as "AI-Powered **Observability and Security**" — two things, one platform. Sentinel's
two things are **Prevention + Detection**:

> **Sentinel — audit-informed security monitoring for Stacks smart contracts.**
> Prevention (multi-agent audit) and Detection (continuous, context-aware monitoring) in one system —
> from pre-launch through production.

The moat line: *"monitoring scoped by an actual audit of your contracts — not generic rules."*

## Voice & tone (borrowed from Datadog)
- **Confident + category-defining.** State what it does plainly; no hedging, no hype.
- **Technical + credible.** The reader is a security-minded smart-contract engineer. Precise terms
  (finding, PoC, signature, timelock, outflow) used correctly.
- **Outcome-first verbs:** *audit, detect, correlate, reproduce, alert, act.* Every alert ties to a
  consequence ("would drain the treasury", "matches a proven bug").
- **Calm under pressure.** Even a critical WARN reads measured — this is a security tool, not a klaxon.
- **Honest.** Never overclaim: Type-2 is *detection* ("already on-chain"), a signature match is a
  *correlation* not a confirmed exploit, disclosure is *human-gated*. The product's credibility IS the copy.
- Micro-copy states coverage (Datadog move): empty state = "No active alerts — watching N contracts across
  M functions," not "You're all caught up! 🎉".

## Visual tokens — Warp-derived (extracted from warp.co)
Modern grotesk, near-black ink, neutral grays, one warm-orange accent, restrained shadows, ~10px radii.
**Light + dark, driven by `prefers-color-scheme` — NO in-app theme toggle.**

### Color
| role | light | dark (derived) |
|---|---|---|
| bg | `#FFFFFF` | `#0A0A0A` |
| surface / card | `#F9F9F9` | `#161616` |
| surface-2 (raised) | `#FCFCFC` | `#1C1C1C` |
| border | `#E5E5E5` | `#262626` |
| border-strong | `#D9D9D9` | `#2E2E2E` |
| ink (body) | `#202020` | `#EDEDED` |
| ink-strong (headings) | `#0A0A0A` | `#FAFAFA` |
| muted (subtext) | `#838383` | `#8A8A8A` |
| **accent (primary)** | `#FF3D00` | `#FF3D00` (pops on dark; hover `#FF5527`) |
| accent-2 | `#F76B15` | `#F76B15` |

Semantic (severity / status — small layer on top of neutral+orange):
| role | color | use |
|---|---|---|
| critical | `#E21200` | confirmed critical bug |
| high / WARN | `#FF3D00` | high-severity → paged (accent doubles as high) |
| medium | `#D97706` | amber |
| low / info | `muted` | neutral, not paged |
| success / green-PoC / resolved | `#16A34A` | reproduced PoC, benign, acknowledged |
| prevention lane | accent/orange (action — veto before block N) | Type-1 |
| detection lane | cool/neutral (already-on-chain — forensics) | Type-2 |

### Type — Geist (substitute for Warp's proprietary `restartSoft`/`Macan`)
Warp uses proprietary grotesks; **Geist** (variable) is the closest free match — same modern-grotesk feel,
supports Warp's mid-weights. Mono: **Geist Mono** for addresses / tx-ids / amounts (a chain/security
product needs a first-class mono).
- Weights: body 400–450, labels/headings **500**, strong headings **600** (Warp stays mid-weight — never
  800/900).
- Headings get tight tracking (~`-0.011em` to `-0.015em`), matching Warp's `-0.35px`–`-0.42px`.
- App scale: base `14px`; steps 12 / 13 / 14 / 16 / 20 / 28. Body line-height ~1.5.

### Radii / shadows / density
- Radii: control `8px`, card `10px`, large `12px`.
- Shadows (light): restrained — ring `0 0 0 1px rgba(0,0,0,.06)` + soft `0 1px 2px rgba(0,0,0,.05)`;
  elevated = layered low-alpha (0.04–0.06). Dark: lean on borders, shadows near-invisible.
- Density: information-rich but calm — comfortable padding, clear grouping (Warp's dashboard is dense yet
  breathable). Not cramped.

## First screen (in progress)
**App shell + Alerts feed.** Left nav (Alerts · Contracts · Monitoring Plan · Audits), a top bar with
⌘K search, and the alerts feed split into **PREVENTION** and **DETECTION** lanes. Each alert:
severity/class (bug vs centralization), verifier verdict, PoC status (green / pending / n/a),
confidence, blast radius, recommendedAction, and human-gated actions (disclose / escalate / veto /
acknowledge / dismiss). Grounded in `docs/product/control-plane-ux.md` + the real `Adjudication`/`Finding`
shapes (`monitoring/adjudication.ts`). Mock data from Zest / CCD002 / DLMM.
