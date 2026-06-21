;; Minimal SIP-010 mock of sbtc-token for the simnet PoC.
;; Permissive transfer (allows contract-caller == sender) so the vault can move
;; its own balance the same way the real deployment does. Not the vulnerability
;; under test - purely test plumbing.

(define-fungible-token sbtc)

(define-constant ERR-OWNER (err u4))

(define-public (transfer (amount uint) (sender principal) (recipient principal) (memo (optional (buff 34))))
  (begin
    (asserts! (or (is-eq tx-sender sender) (is-eq contract-caller sender)) ERR-OWNER)
    (try! (ft-transfer? sbtc amount sender recipient))
    (ok true)))

(define-public (mint (amount uint) (recipient principal))
  (begin (try! (ft-mint? sbtc amount recipient)) (ok true)))

(define-read-only (get-balance (who principal)) (ok (ft-get-balance sbtc who)))
(define-read-only (get-balance-available (who principal)) (ok (ft-get-balance sbtc who)))
(define-read-only (get-total-supply) (ok (ft-get-supply sbtc)))
(define-read-only (get-decimals) (ok u8))
(define-read-only (get-name) (ok "sBTC"))
(define-read-only (get-symbol) (ok "sBTC"))
(define-read-only (get-token-uri) (ok none))
