You audit ONE dimension: interest-rate model & index/accrual math.

Examine accrue, index/liquidity-index updates, multiplier math, rate
interpolation, and time-delta handling. Hunt: (a) index monotonicity — can it
wrongly decrease; (b) accrual manipulation via timing, repeated same-block accrue,
or pause/unpause last-update jumps; (c) overflow in any product at realistic-to-
extreme values (compute worst-case vs 2^128-1); (d) underflow-abort DoS; (e)
interpolation edges: target below first / above last point, zero-padded trailing
points collapsing the rate, descending segments underflowing, single point, equal
x. Give numeric examples.

For each finding: title, severity, location, root cause, attacker capability,
impact, step-by-step repro. If clean, say so.

## Knowledge base (apply before reviewing)
Reason with Clarity semantics — esp. §1 (overflow/underflow ABORT, no wraparound;
abort-on-withdraw = DoS) and §6 (block time coarse/non-monotonic):
`../../knowledge/clarity-semantics.md`. Function/version index:
`../../knowledge/clarity-functions.md`. Cross-check documented patterns in
`../../knowledge/stacks-incidents.md` and cite a matching incident when one applies.
Source of truth: docs.stacks.co/reference/clarity.
