# Sentinel — DESIGN

Visual system derived from **Warp** (warp.co) real tokens (agent-browser extraction), expressed in OKLCH
with neutrals warm-tinted toward the accent hue. See `design/design-language.md` for the origin narrative.

## Theme
Scene: a Stacks security engineer scanning alerts on a 27-inch monitor during the workday, then glancing at
their phone when a WARN pages at 1am. Both **light** (daytime desk) and **dark** (night/phone) are
first-class, driven by `prefers-color-scheme`. NO in-app theme toggle: respect the OS.

## Color
Strategy: **Restrained** — warm-tinted neutrals + one accent (orange) held ≤10% of the surface; a small
semantic layer for severity. Never `#000`/`#fff`; every neutral carries a faint warm tint (chroma ~0.005).

Light:
- bg `oklch(0.99 0.003 60)` · surface `oklch(0.975 0.004 60)` · surface-2 `oklch(0.985 0.004 60)`
- border `oklch(0.91 0.005 60)` · border-strong `oklch(0.87 0.006 60)`
- ink `oklch(0.28 0.006 50)` · ink-strong `oklch(0.18 0.006 50)` · muted `oklch(0.60 0.006 50)`

Dark:
- bg `oklch(0.16 0.004 60)` · surface `oklch(0.20 0.005 60)` · surface-2 `oklch(0.235 0.005 60)`
- border `oklch(0.28 0.006 60)` · border-strong `oklch(0.34 0.006 60)`
- ink `oklch(0.93 0.004 60)` · ink-strong `oklch(0.98 0.003 60)` · muted `oklch(0.66 0.006 60)`

Accent (both): `oklch(0.64 0.22 33)` (≈ Warp #FF3D00) · hover `oklch(0.68 0.20 36)`.
Semantic: critical `oklch(0.55 0.22 27)` · high = accent · medium `oklch(0.72 0.14 70)` (amber) ·
success / green-PoC `oklch(0.62 0.14 150)` · info = muted.
Lane cue: Prevention leans warm/accent (action, veto-before-block-N); Detection leans neutral-cool
(forensic, already on-chain). Cue by treatment, never by a colored side-stripe.

## Typography — Geist / Geist Mono
Weights: body 400–450, labels/headings 500, strong 600. Never 800+. Headings tracking ~`-0.012em`.
Scale: 12 / 13 / 14 (base) / 16 / 20 / 28, ≥1.25 steps where it's hierarchy. Body line-height ~1.5,
capped 65–75ch. **Geist Mono** for addresses, tx-ids, uint amounts, block heights.

## Elevation & shape
Radii: control `8px`, card `10px`, large `12px`. Shadows restrained (light): ring
`0 0 0 1px oklch(0 0 0 / 0.06)` + soft `0 1px 2px oklch(0 0 0 / 0.05)`; elevated = layered low-alpha
(0.04–0.06). Dark: lean on borders, shadows near-invisible.

## Components & patterns
- **Alerts are a typographic list, not an identical-card grid.** Severity reads from a leading filled dot /
  icon + a chip, NEVER a colored left side-stripe (banned). Group with a full 1px border or a faint bg tint.
- **Chips** for severity / class / verdict / PoC status: small, low-chroma, only the meaningful one carries
  color.
- **Human-gated action row** is explicit; outward/irreversible actions (disclose, escalate) are visually
  distinct and confirm-gated. Sentinel routes intent, never acts.
- Top bar: ⌘K search + a coverage stat ("watching N contracts · M functions").
- Density: information-rich but breathable, Warp's cadence. Vary spacing for rhythm; don't box everything.
