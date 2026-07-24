<!-- House-voice rendering (finding-report skill). Client-facing summary; the full audit
     report with per-finding refutation mechanics is dlmm-pool-stx-usdcx-v-1-bps-10.md. -->

**DLMM STX/USDCx pool: no exploitable bug. The real risk is admin migration with no core-hash allowlist.**

`SM1FKXGNZJWSTWDWXQZJNF7B5TV5ZB235JTCXYXKD.dlmm-pool-stx-usdcx-v-1-bps-10` · ~$9.4M TVL · clean (centralization only)

Five auditors, every high/critical adversarially verified. Every "bug" claim fell over — the scary one, a cross-bin LP drain, doesn't exist: ownership is per-bin, so withdrawing at a bin you never funded reads a zero balance and aborts. Share accounting, fee conservation, rounding, and reentrancy are all sound.

What's worth acting on is trust, not a bug:

- **Admin migration (High, trust).** An admin can repoint the pool's `core-address` at arbitrary code after a ≥1-week timelock → 100% of TVL. Non-admins can't reach it and LPs can exit during the timelock, but the migration target isn't pinned to a verified core code-hash. **Fix: core-hash allowlist and/or multisig.**
- **Pool freeze (Medium, trust).** Admin can kill swaps while withdrawals stay open — griefing surface. Gate behind multisig/DAO.

No bug shipped, so no PoC — nothing outsider-reachable to reproduce. Everything above is disclosed-trust, not an exploit.
