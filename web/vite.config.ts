import { defineConfig, loadEnv, type Connect, type Plugin } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import path from "path"

/**
 * Dev-only: emulate the web/api/*.ts Vercel Functions under `vite dev`. Vercel Functions only run
 * under `vercel dev` or a real deploy otherwise, so plain `bun run dev` 404s on /api/*. In prod
 * these read STACKS_NODE_URL etc. from the Vercel project's env; loadRootEnv (below) covers local
 * dev by pulling the same repo-root .env.local the engine already uses, so no manual export step.
 */
function apiDevPlugin(): Plugin {
  const routes: Record<string, string> = { "/api/scan": "/api/scan.ts" }
  return {
    name: "api-dev",
    apply: "serve",
    configureServer(server) {
      const middleware: Connect.NextHandleFunction = async (req, res, next) => {
        const url = req.url?.split("?")[0]
        const modulePath = url && routes[url]
        if (!modulePath) return next()

        const chunks: Buffer[] = []
        for await (const chunk of req) chunks.push(chunk as Buffer)
        const body = Buffer.concat(chunks).toString("utf8")

        const mod = await server.ssrLoadModule(modulePath)
        const handler = mod.default as (req: Request) => Promise<Response>
        const webReq = new Request(`http://localhost${req.url}`, {
          method: req.method,
          headers: { "content-type": "application/json" },
          body: req.method === "POST" ? body : undefined,
        })
        const webRes = await handler(webReq)
        res.statusCode = webRes.status
        webRes.headers.forEach((value, key) => res.setHeader(key, value))
        res.end(await webRes.text())
      }
      server.middlewares.use(middleware)
    },
  }
}

/** Dev-only: pull STACKS_NODE_URL etc. from the repo-root .env.local into process.env, so
 * `bun run dev` matches what the engine already does (`set -a; . ./.env.local`) without the
 * caller having to source it by hand. web/api/*.ts reads plain process.env, not import.meta.env,
 * so this must assign to process.env directly — Vite's own env handling only covers VITE_*
 * client vars. */
function loadRootEnv(mode: string) {
  const env = loadEnv(mode, path.resolve(__dirname, ".."), "")
  for (const [key, value] of Object.entries(env)) {
    if (process.env[key] === undefined) process.env[key] = value
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  loadRootEnv(mode)
  return {
    plugins: [react(), tailwindcss(), apiDevPlugin()],
    resolve: {
      alias: { "@": path.resolve(__dirname, "./src") },
    },
  }
})
