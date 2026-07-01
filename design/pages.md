# Sentinel — page inventory (MVP)

The minimal set of pages that tells the whole story across three surfaces. **Marketing** = brand register
(design is the product). **Onboarding** + **Platform** = product register (design serves the task). All share
the design system in `docs/DESIGN.md` (Warp visual) + voice in `docs/PRODUCT.md` (Datadog framing).

Status: ✅ built · ◻︎ MVP (this version) · ⋯ vNext.

## Marketing — brand register (public, unauthenticated)
| Page | Purpose | Status |
|---|---|---|
| **Landing / home** | The pitch: audit-informed security monitoring = Prevention + Detection. Hero, the two-pillar story, the moat ("your audit generates the monitoring"), a product peek, proof (the Zest socialize-debt finding + green PoC), CTA. | ✅ `design/landing.html` |
| **How it works** | The lifecycle: audit → distill → KB → provision → monitor → alert. Reuse the existing interactive diagram (`design/sentinel-lifecycle.html`). Can live as a landing section or its own page. | ◻︎ |
| **Pricing** | Tiers per `docs/business-model.md` (one-off audit / monitoring retainer / enterprise). | ◻︎ |
| **Security & disclosure** | Credibility for a security product: never-mainnet, coordinated disclosure, sandboxed PoCs, data handling. | ⋯ |
| Blog / changelog / about | — | ⋯ |

## Onboarding — the activation flow (product register)
| Page | Purpose | Status |
|---|---|---|
| **Sign in / sign up** | Auth (email/SSO; optionally connect a Stacks address). Table-stakes, low design surface. | ◻︎ |
| **First-run: onboard a contract** | The activation spine + the moat in motion: paste a contract id → Sentinel audits it → distills a candidate KB → you review/tune the Monitoring Plan → provision subscriptions → live. Multi-step. | ◻︎ |
| **Empty states** | First-run Alerts/Contracts ("watching nothing yet, add your first contract"). Teach the interface. | ◻︎ (part of the app screens) |

## Platform — the control plane (product register, authenticated)
| Page | Purpose | Status |
|---|---|---|
| **Alerts** | The WARN/INFO feed, Prevention + Detection lanes, human-gated actions. | ✅ `design/control-plane.html` |
| **Contracts** | The watched set: per contract — archetype, monitoring status, subscription health, daily spend, last audit, open alerts. The app's landing view. | ◻︎ |
| **Contract detail + Monitoring Plan** | One contract's KB made tunable — the **moat screen**: sensitive fns + trigger classes, thresholds (audit-suggested → you promote), Type-2 signatures, accepted waivers, outflow baselines. Plus its alert + audit history. "Audit suggests, you tune." | ✅ `design/monitoring-plan.html` |
| **Audit detail** | One audit run: findings (bug vs centralization, honestly labeled), the green-PoC artifact, metrics (cost / turns / latency), the report. The credibility surface. | ◻︎ |
| **Settings** | Notification routes/channels, daily spend ceiling, team, API keys / webhook secrets. | ◻︎ (lite) |
| Audits (history list) | All audit runs across contracts. | ⋯ (or a tab on Contract detail) |
| Alert detail (full page) | Deep single-alert investigation (finding, PoC, tx, timeline, disclosure). Inline expand covers MVP. | ⋯ |

## MVP total: ~9 mockups (3 built → ~6 to go)
Built: **Alerts**, **Landing**, **Contract detail + Monitoring Plan**. Remaining: Marketing (How-it-works,
Pricing) · Onboarding (Sign-in, First-run) · Platform (Contracts, Audit detail, Settings).

## Recommended mockup sequence
1. **Landing** — the brand anchor. Flexes the brand register (bigger typographic moments, the hero, the
   moat, proof) now that the product visual system is set. Highest-visibility artifact; validates the
   Warp + Datadog direction publicly before more app screens.
2. **Contract detail + Monitoring Plan** — the moat screen; the product's differentiator; reuses the app system.
3. **Contracts** — the app landing that ties Alerts + Contract-detail together.
4. **Audit detail** — findings + green PoC + metrics (the credibility artifact; strong marketing screenshot too).
5. **First-run onboarding** — connects marketing → app; reuses the Monitoring Plan review.
6. **Pricing · Sign-in · Settings** — table-stakes, quicker passes.
