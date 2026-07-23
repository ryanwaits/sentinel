/**
 * Sandbox egress proxy — the DISCRIMINATOR half of the fork-sandbox boundary.
 *
 * Fork-mode PoCs (clarinet `[repl.remote_data]`) must read chain state at run time, so they cannot
 * run under `--network none` like the airgapped harness does. This service is what they read
 * through: a CONNECT-only allowlist proxy that permits exactly the hosts in SENTINEL_EGRESS_ALLOW
 * and refuses everything else.
 *
 * READ THIS BEFORE TRUSTING IT. This proxy is NOT the containment boundary, and an HTTPS_PROXY env
 * var is not either — measured 2026-07-23: with HTTPS_PROXY set, `fetch` was correctly refused (403)
 * but a raw socket walked straight past the proxy and reached the open internet. Proxy env is
 * VOLUNTARY, and PoC code is model-authored, so it cannot be relied on to volunteer.
 *
 * Containment is the network: the sandbox container runs on a docker `--internal` network (no route
 * off-host, DNS does not even resolve), and this proxy is the only peer on it, dual-homed onto a
 * normal egress network. A raw socket then has nowhere to go. This process decides WHICH hosts get
 * through; the internal network is what makes the decision unavoidable. Both are required.
 *
 * Run: bun run deploy/egress-proxy.ts
 * Env: SENTINEL_EGRESS_PORT (8899) · SENTINEL_EGRESS_ALLOW (comma-separated hosts, deny-all default)
 */

const PORT = Number(process.env.SENTINEL_EGRESS_PORT ?? 8899);
const ALLOW = new Set(
  (process.env.SENTINEL_EGRESS_ALLOW ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean),
);
/** Only TLS. A plaintext tunnel would let a PoC exfiltrate to an allowed host in the clear. */
const ALLOWED_PORTS = new Set([443]);
const IDLE_MS = Number(process.env.SENTINEL_EGRESS_IDLE_MS ?? 120_000);
const MAX_HEADER = 8 * 1024;

type Phase = "handshake" | "tunnel" | "closed";
type Conn = {
  phase: Phase;
  buf: Uint8Array;
  upstream: import("bun").Socket<UpConn> | null;
  /** Chunks that arrived before the upstream socket finished connecting. */
  queued: Uint8Array[];
  timer: ReturnType<typeof setTimeout> | null;
};
type UpConn = { client: import("bun").Socket<Conn> };

const log = (...a: unknown[]) => console.log(new Date().toISOString(), ...a);

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

function refuse(sock: import("bun").Socket<Conn>, status: string, why: string) {
  log(`DENY   ${why}`);
  try {
    sock.write(`HTTP/1.1 ${status}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n`);
    sock.flush();
  } catch {
    /* client already gone */
  }
  sock.data.phase = "closed";
  sock.end();
}

function arm(sock: import("bun").Socket<Conn>) {
  if (sock.data.timer) clearTimeout(sock.data.timer);
  sock.data.timer = setTimeout(() => {
    sock.data.upstream?.end();
    sock.end();
  }, IDLE_MS);
}

/**
 * Parse `CONNECT host:port HTTP/1.1`. Anything else is refused: the only protocol a fork PoC needs
 * is a TLS tunnel, and every other method widens the surface for no benefit.
 */
function parseConnect(head: string): { host: string; port: number } | { error: string } {
  const line = head.split("\r\n", 1)[0] ?? "";
  const [method, target] = line.split(" ");
  if (method !== "CONNECT") return { error: `non-CONNECT method ${method || "(none)"}` };
  const idx = (target ?? "").lastIndexOf(":");
  if (idx < 1) return { error: `malformed CONNECT target ${target}` };
  const host = target.slice(0, idx).toLowerCase();
  const port = Number(target.slice(idx + 1));
  if (!Number.isInteger(port)) return { error: `malformed port in ${target}` };
  return { host, port };
}

function openTunnel(client: import("bun").Socket<Conn>, host: string, port: number) {
  Bun.connect<UpConn>({
    hostname: host,
    port,
    data: { client },
    socket: {
      open(up) {
        client.data.upstream = up;
        client.data.phase = "tunnel";
        client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
        for (const chunk of client.data.queued) up.write(chunk);
        client.data.queued = [];
        arm(client);
      },
      data(up, chunk) {
        arm(up.data.client);
        up.data.client.write(chunk);
      },
      close(up) {
        up.data.client.end();
      },
      error(up, err) {
        log(`ERROR  upstream ${host}:${port} ${err?.message ?? err}`);
        up.data.client.end();
      },
    },
  }).catch((err) => {
    refuse(client, "502 Bad Gateway", `upstream connect failed ${host}:${port} (${err?.message})`);
  });
}

Bun.listen<Conn>({
  hostname: "0.0.0.0", // must be reachable from the sandbox container, not just loopback
  port: PORT,
  socket: {
    open(sock) {
      sock.data = {
        phase: "handshake",
        buf: new Uint8Array(0),
        upstream: null,
        queued: [],
        timer: null,
      };
      arm(sock);
    },
    data(sock, chunk) {
      arm(sock);
      if (sock.data.phase === "tunnel") {
        if (sock.data.upstream) sock.data.upstream.write(chunk);
        else sock.data.queued.push(chunk); // upstream still connecting
        return;
      }
      if (sock.data.phase === "closed") return;

      sock.data.buf = concat(sock.data.buf, chunk);
      if (sock.data.buf.length > MAX_HEADER) {
        return refuse(sock, "431 Request Header Fields Too Large", "oversized handshake");
      }
      const head = new TextDecoder().decode(sock.data.buf);
      if (!head.includes("\r\n\r\n")) return; // headers incomplete, wait for more

      const parsed = parseConnect(head);
      if ("error" in parsed) return refuse(sock, "405 Method Not Allowed", parsed.error);
      const { host, port } = parsed;
      if (!ALLOWED_PORTS.has(port)) return refuse(sock, "403 Forbidden", `port ${host}:${port}`);
      if (!ALLOW.has(host)) return refuse(sock, "403 Forbidden", `host ${host}`);

      log(`ALLOW  ${host}:${port}`);
      sock.data.phase = "tunnel";
      sock.data.buf = new Uint8Array(0);
      openTunnel(sock, host, port);
    },
    close(sock) {
      if (sock.data?.timer) clearTimeout(sock.data.timer);
      sock.data?.upstream?.end();
    },
    error(sock, err) {
      log(`ERROR  client ${err?.message ?? err}`);
      sock.data?.upstream?.end();
    },
  },
});

if (ALLOW.size === 0) {
  log(
    "WARN   SENTINEL_EGRESS_ALLOW is empty — deny-all. Fork-mode PoCs will fail until it is set.",
  );
}
log(
  `egress proxy listening on 0.0.0.0:${PORT} · CONNECT-only :443 · allow=[${[...ALLOW].join(", ")}]`,
);
