import { jwtHmac, none } from "eve/channels/auth";
import { eveChannel } from "eve/channels/eve";
import { EVE_JWT_AUDIENCE, EVE_JWT_ISSUER } from "../../monitoring/eve-jwt";

/**
 * Default eve HTTP channel — serves the built-in /eve/v1 routes:
 *   POST /eve/v1/session            create a session
 *   POST /eve/v1/session/:id        deliver a follow-up
 *   GET  /eve/v1/session/:id/stream NDJSON event feed (durable + replayable via ?startIndex=)
 *
 * AUTH (M0 item 2): a public webhook + per-trigger spend turns an open session endpoint into a
 * budget-drain weapon (forge a session POST → force a ~$2 sweep). So the endpoint is authed with
 * an HMAC-signed bearer JWT (`jwtHmac`), minted per request by the bridge and the run reader
 * (monitoring/eve-jwt.ts). This is a cost-safety control, paired with the global daily spend
 * ceiling — not just hardening.
 *
 * Fail-closed: when EVE_SESSION_SECRET is set, every route requires a valid token. Anonymous
 * access requires an EXPLICIT opt-out (EVE_ALLOW_ANON=1) for local dev — never the silent
 * default, so a missing secret in prod doesn't quietly expose the path.
 *
 * Run observability is NOT done here — channel `events` handlers are platform push-delivery and
 * are not driven by the headless HTTP path. Read finished runs via the durable, replayable
 * stream (monitoring/run-reader.ts). See memory eve-headless-run-readout.
 */
const SECRET = process.env.EVE_SESSION_SECRET;

const auth = SECRET
  ? jwtHmac({
      algorithm: "HS256",
      audiences: [EVE_JWT_AUDIENCE],
      issuer: EVE_JWT_ISSUER,
      secret: SECRET,
    })
  : (() => {
      if (process.env.EVE_ALLOW_ANON === "1") {
        console.warn(
          "[eve.channel] EVE_SESSION_SECRET unset and EVE_ALLOW_ANON=1 — session endpoint is ANONYMOUS (local dev only).",
        );
        return none();
      }
      console.warn(
        "[eve.channel] EVE_SESSION_SECRET unset — session endpoint will REJECT all requests (401). Set EVE_SESSION_SECRET, or EVE_ALLOW_ANON=1 for local dev.",
      );
      // Empty auth array => routeAuth walk exhausts => 401 on every request (fail closed).
      return [] as const;
    })();

export default eveChannel({ auth });
