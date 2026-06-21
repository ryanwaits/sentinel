;; ============================================================================
;; Reduced, faithful reproduction of SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7
;;   .v0-vault-sbtc  ("Zest sBTC") - for PoC of audit Finding 1
;;   (socialize-debt forces unbounded LP loss; no bad-debt precondition / cap).
;;
;; FIDELITY: socialize-debt / redeem / deposit / total-assets / convert math
;;   are copied VERBATIM from the audited mainnet source. Only test plumbing is
;;   reduced, and none of it touches the vulnerability:
;;     - underlying -> local .sbtc-token mock (permissive SIP-010)
;;     - DAO auth simplified: tx-sender == (var-get dao); dao = deployer
;;     - dao-treasury / interest accrual removed: accrue() is a same-block
;;       pass-through (time-delta = 0 => no interest, no treasury mint), which
;;       is exactly the real behaviour within a single block.
;;     - self-principal via (as-contract tx-sender) instead of current-contract.
;; ============================================================================

(define-constant BPS u10000)
(define-constant INDEX-PRECISION u1000000000000)
(define-constant MINIMUM-LIQUIDITY u1000)
(define-constant NULL-ADDRESS 'SP000000000000000000002Q6VF78)

(define-constant ERR-AUTH (err u801001))
(define-constant ERR-INIT (err u801002))
(define-constant ERR-ALREADY-INITIALIZED (err u801003))
(define-constant ERR-AMOUNT-ZERO (err u801009))
(define-constant ERR-SLIPPAGE (err u801010))
(define-constant ERR-SUPPLY-CAP-EXCEEDED (err u801011))
(define-constant ERR-OUTPUT-ZERO (err u801012))
(define-constant ERR-INSUFFICIENT-BALANCE (err u801013))
(define-constant ERR-INSUFFICIENT-LIQUIDITY (err u801014))
(define-constant ERR-INSUFFICIENT-VAULT-LIQUIDITY (err u801018))
(define-constant ERR-DEBT-CAP-EXCEEDED (err u801019))
(define-constant ERR-INSUFFICIENT-ASSETS (err u801020))

(define-data-var dao principal tx-sender)
(define-data-var initialized bool false)
(define-data-var cap-supply uint u0)
(define-data-var cap-debt uint u0)
(define-data-var fee-reserve uint u0)
(define-data-var assets uint u0)
(define-data-var total-borrowed uint u0)
(define-data-var principal-scaled uint u0)
(define-data-var index uint INDEX-PRECISION)
(define-data-var lindex uint INDEX-PRECISION)

(define-map authorized-contracts principal bool)
(define-fungible-token zft)

;; -- math (verbatim) --
(define-private (mul-div-down (x uint) (y uint) (z uint)) (/ (* x y) z))
(define-private (mul-div-up (x uint) (y uint) (z uint)) (/ (+ (* x y) (- z u1)) z))

(define-private (total-supply) (ft-get-supply zft))
(define-private (get-balance-internal (acc principal)) (ft-get-balance zft acc))

(define-private (receive-underlying (amount uint) (account principal))
  (begin (try! (contract-call? .sbtc-token transfer amount account (as-contract tx-sender) none)) (ok true)))
(define-private (send-underlying (amount uint) (account principal))
  (begin (try! (contract-call? .sbtc-token transfer amount (as-contract tx-sender) account none)) (ok true)))

(define-private (calc-cumulative-debt (principal-amount uint) (idx uint))
  (mul-div-up principal-amount idx INDEX-PRECISION))
(define-private (total-debt) (calc-cumulative-debt (var-get principal-scaled) (var-get index)))
(define-private (total-assets)
  (let ((current-assets (var-get assets)) (debt (total-debt)) (borrowed (var-get total-borrowed))
        (interest (if (> debt borrowed) (- debt borrowed) u0)))
    (+ current-assets interest)))

(define-private (convert-to-shares-preview (amount uint))
  (let ((ta (total-assets)) (ts (total-supply)))
    (if (is-eq ts u0) amount (if (is-eq ta u0) u0 (mul-div-down amount ts ta)))))
(define-private (convert-to-assets-preview (amount uint))
  (let ((ta (total-assets)) (ts (total-supply)))
    (if (is-eq ta u0) u0 (if (is-eq ts u0) u0 (mul-div-down amount ta ts)))))

(define-read-only (get-available-assets)
  (let ((current-assets (var-get assets)) (borrowed (var-get total-borrowed)))
    (if (>= current-assets borrowed) (- current-assets borrowed) u0)))

(define-read-only (get-total-assets) (ok (total-assets)))
(define-read-only (convert-to-assets (amount uint)) (ok (convert-to-assets-preview amount)))
(define-read-only (get-balance (account principal)) (ok (get-balance-internal account)))
(define-read-only (get-assets) (ok (var-get assets)))
(define-read-only (get-debt) (ok (total-debt)))
(define-read-only (get-principal-scaled) (ok (var-get principal-scaled)))
(define-read-only (get-lindex) (ok (var-get lindex)))
(define-read-only (is-authorized-contract (c principal)) (default-to false (map-get? authorized-contracts c)))

(define-private (check-dao-auth) (ok (asserts! (is-eq tx-sender (var-get dao)) ERR-AUTH)))
(define-private (check-caller-auth) (ok (asserts! (is-authorized-contract contract-caller) ERR-AUTH)))

;; same-block pass-through (faithful: time-delta = 0)
;; (asserts! true ...) pins the err branch to uint so callers' (try! (accrue)) type-checks.
(define-public (accrue)
  (begin
    (asserts! true ERR-AMOUNT-ZERO)
    (ok { index: (var-get index), lindex: (var-get lindex) })))

(define-public (set-cap-supply (val uint)) (begin (try! (check-dao-auth)) (var-set cap-supply val) (ok true)))
(define-public (set-cap-debt (val uint)) (begin (try! (check-dao-auth)) (var-set cap-debt val) (ok true)))
(define-public (set-fee-reserve (val uint)) (begin (try! (check-dao-auth)) (var-set fee-reserve val) (ok true)))
(define-public (set-authorized-contract (c principal) (a bool))
  (begin (try! (check-dao-auth)) (ok (map-set authorized-contracts c a))))

(define-public (initialize)
  (begin
    (asserts! (not (var-get initialized)) ERR-ALREADY-INITIALIZED)
    (var-set initialized true)
    (try! (deposit MINIMUM-LIQUIDITY u0 NULL-ADDRESS))
    (ok true)))

;; -- deposit (verbatim core) --
(define-public (deposit (amount uint) (min-out uint) (recipient principal))
  (let ((u (try! (accrue)))
        (account contract-caller)
        (CAP-SUPPLY (var-get cap-supply))
        (current-assets (var-get assets))
        (inkind (convert-to-shares-preview amount)))
    (asserts! (var-get initialized) ERR-INIT)
    (asserts! (> amount u0) ERR-AMOUNT-ZERO)
    (asserts! (>= inkind min-out) ERR-SLIPPAGE)
    (asserts! (<= (+ current-assets amount) CAP-SUPPLY) ERR-SUPPLY-CAP-EXCEEDED)
    (try! (receive-underlying amount account))
    (try! (ft-mint? zft inkind recipient))
    (var-set assets (+ current-assets amount))
    (ok inkind)))

;; -- redeem (verbatim core) --
(define-public (redeem (amount uint) (min-out uint) (recipient principal))
  (let ((u (try! (accrue)))
        (account contract-caller)
        (current-assets (var-get assets))
        (balance (get-balance-internal account))
        (balance-check (asserts! (>= balance amount) ERR-INSUFFICIENT-BALANCE))
        (available-assets (get-available-assets))
        (inkind (convert-to-assets-preview amount)))
    (asserts! (>= current-assets inkind) ERR-INSUFFICIENT-ASSETS)
    (asserts! (> amount u0) ERR-AMOUNT-ZERO)
    (asserts! (> inkind u0) ERR-OUTPUT-ZERO)
    (asserts! (>= inkind min-out) ERR-SLIPPAGE)
    (asserts! (>= available-assets inkind) ERR-INSUFFICIENT-LIQUIDITY)
    (try! (ft-burn? zft amount account))
    (try! (send-underlying inkind recipient))
    (var-set assets (- current-assets inkind))
    (ok inkind)))

;; -- system-borrow (verbatim core) -- creates the active lending state Finding 1 needs
(define-public (system-borrow (amount uint) (receiver principal))
  (let ((u (try! (accrue)))
        (CAP-DEBT (var-get cap-debt))
        (available-assets (get-available-assets))
        (scaled-principal (var-get principal-scaled))
        (idx (var-get index))
        (debt (total-debt))
        (scaled-amount (mul-div-up amount INDEX-PRECISION idx))
        (updated-scaled-principal (+ scaled-principal scaled-amount)))
    (try! (check-caller-auth))
    (asserts! (> amount u0) ERR-AMOUNT-ZERO)
    (asserts! (<= amount available-assets) ERR-INSUFFICIENT-VAULT-LIQUIDITY)
    (asserts! (<= (+ debt amount) CAP-DEBT) ERR-DEBT-CAP-EXCEEDED)
    (var-set principal-scaled updated-scaled-principal)
    (var-set total-borrowed (+ (var-get total-borrowed) amount))
    (try! (send-underlying amount receiver))
    (ok true)))

;; -- socialize-debt (VERBATIM from mainnet lines 942-982) -- the vulnerability --
(define-public (socialize-debt (scaled-amount uint))
  (let ((scaled-principal (var-get principal-scaled))
        (borrowed (var-get total-borrowed))
        (idx (var-get index))
        (current-assets (var-get assets))
        (current-lindex (var-get lindex))
        (old-total-assets (total-assets))
        (debt-reduction (mul-div-down scaled-amount idx INDEX-PRECISION))
        (principal-reduction (if (> scaled-principal u0)
                                (mul-div-down scaled-amount borrowed scaled-principal)
                                u0))
        (new-lindex (if (and (> old-total-assets u0) (> old-total-assets debt-reduction))
                       (mul-div-down current-lindex (- old-total-assets debt-reduction) old-total-assets)
                       u0)))
    (try! (check-caller-auth))
    (asserts! (> scaled-amount u0) ERR-AMOUNT-ZERO)
    (var-set lindex new-lindex)
    (var-set principal-scaled (if (> scaled-principal scaled-amount) (- scaled-principal scaled-amount) u0))
    (var-set total-borrowed (if (> borrowed principal-reduction) (- borrowed principal-reduction) u0))
    (var-set assets (if (> current-assets principal-reduction) (- current-assets principal-reduction) u0))
    (ok true)))
