import { useEffect, useState } from "react"
import { getHighlighter } from "@/lib/clarity-highlight"

/** Shiki-highlighted Clarity, dual-theme (light/dark via prefers-color-scheme). */
export function CodeBlock({ code }: { code: string }) {
  const [html, setHtml] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    getHighlighter()
      .then((hl) => {
        const out = hl.codeToHtml(code, {
          lang: "clarity",
          themes: { light: "sentinel-light", dark: "sentinel-dark" },
          defaultColor: "light",
        })
        if (alive) setHtml(out)
      })
      .catch(() => {
        if (alive) setHtml(null)
      })
    return () => {
      alive = false
    }
  }, [code])

  if (!html) {
    // plain, correctly-sized fallback while the highlighter loads (no layout flash)
    return <pre className="clarity-code text-muted-foreground">{code}</pre>
  }
  return <div className="clarity-code" dangerouslySetInnerHTML={{ __html: html }} />
}
