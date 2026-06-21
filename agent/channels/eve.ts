import { eveChannel } from "eve/channels/eve";
import { none } from "eve/channels/auth";

/**
 * Default eve HTTP channel — serves the built-in /eve/v1 routes:
 *   POST /eve/v1/session            create a session
 *   POST /eve/v1/session/:id        deliver a follow-up
 *   GET  /eve/v1/session/:id/stream NDJSON event feed
 *
 * `none()` = anonymous (spike / local dev). Tighten auth before production
 * (e.g. localDev(), jwtHmac(), or the secondlayer-webhook bridge's HMAC).
 */
export default eveChannel({ auth: none() });
