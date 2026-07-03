import type { HighlighterCore, LanguageRegistration, ThemeRegistrationRaw } from "shiki/core"

// A minimal Clarity TextMate grammar: enough to color the core define-* forms,
// builtins, types, constants, and comments. Not a full spec, deliberately small.
const clarity: LanguageRegistration = {
  name: "clarity",
  scopeName: "source.clarity",
  patterns: [
    { include: "#comment" },
    { include: "#string" },
    { include: "#definition" },
    { include: "#keyword" },
    { include: "#type" },
    { include: "#constant" },
    { include: "#punctuation" },
  ],
  repository: {
    comment: { match: ";+.*$", name: "comment.line.clarity" },
    string: { begin: '"', end: '"', name: "string.quoted.double.clarity" },
    definition: {
      match:
        "(?<![\\w\\-])(define-(?:public|read-only|private|data-var|map|constant|fungible-token|non-fungible-token|trait))(?:\\s+\\(?\\s*)([a-z][a-zA-Z0-9\\-!?*<>=+/]*)?",
      captures: {
        "1": { name: "keyword.control.definition.clarity" },
        "2": { name: "entity.name.function.clarity" },
      },
    },
    keyword: {
      match:
        "(?<![\\w\\-])(let|if|begin|match|fold|map|filter|and|or|not|try!|unwrap!|unwrap-panic|unwrap-err!|asserts!|contract-call\\?|as-contract|print|ok|err|some|none|is-eq|is-none|is-some|default-to|get|merge|tuple|var-set|var-get|map-set|map-get\\?|map-insert|map-delete|ft-transfer\\?|ft-mint\\?|nft-transfer\\?|stx-transfer\\?)(?![\\w\\-])",
      name: "keyword.other.clarity",
    },
    type: {
      match:
        "(?<![\\w\\-])(uint|int|bool|principal|buff|string-ascii|string-utf8|list|tuple|response|optional)(?![\\w\\-])",
      name: "support.type.clarity",
    },
    constant: {
      patterns: [
        { match: "(?<![\\w\\-])(true|false)(?![\\w\\-])", name: "constant.language.clarity" },
        { match: "(?<![\\w\\-])u[0-9]+(?![\\w\\-])", name: "constant.numeric.uint.clarity" },
        { match: "(?<![\\w\\-])[0-9]+(?![\\w\\-])", name: "constant.numeric.clarity" },
        { match: "'[A-Z0-9]+(?:\\.[a-zA-Z0-9\\-]+)*", name: "constant.other.principal.clarity" },
        { match: "(?<![\\w\\-])[A-Z][A-Z0-9\\-]{2,}(?![\\w\\-])", name: "constant.other.error.clarity" },
      ],
    },
    punctuation: { match: "[()]", name: "punctuation.paren.clarity" },
  },
}

// Sentinel code theme: minimal warm grays, orange only on the core define-* forms.
// Hex approximations of the Warp OKLCH tokens (Shiki themes take hex).
const light: ThemeRegistrationRaw = {
  name: "sentinel-light",
  type: "light",
  bg: "#f5f4f2",
  fg: "#3a3936",
  settings: [
    { scope: ["comment.line"], settings: { foreground: "#adaca6" } },
    { scope: ["keyword.control.definition"], settings: { foreground: "#ec3f0a" } },
    { scope: ["entity.name.function"], settings: { foreground: "#232220" } },
    { scope: ["keyword.other"], settings: { foreground: "#6f6e69" } },
    { scope: ["support.type"], settings: { foreground: "#86857f" } },
    { scope: ["string.quoted"], settings: { foreground: "#86857f" } },
    {
      scope: ["constant.numeric", "constant.language", "constant.other.principal", "constant.other.error"],
      settings: { foreground: "#86857f" },
    },
    { scope: ["punctuation.paren"], settings: { foreground: "#c4c3bd" } },
  ],
}

const dark: ThemeRegistrationRaw = {
  name: "sentinel-dark",
  type: "dark",
  bg: "#201f1d",
  fg: "#e3e2df",
  settings: [
    { scope: ["comment.line"], settings: { foreground: "#757470" } },
    { scope: ["keyword.control.definition"], settings: { foreground: "#ff5c30" } },
    { scope: ["entity.name.function"], settings: { foreground: "#fbfbfa" } },
    { scope: ["keyword.other"], settings: { foreground: "#a5a49f" } },
    { scope: ["support.type"], settings: { foreground: "#8f8e89" } },
    { scope: ["string.quoted"], settings: { foreground: "#8f8e89" } },
    {
      scope: ["constant.numeric", "constant.language", "constant.other.principal", "constant.other.error"],
      settings: { foreground: "#8f8e89" },
    },
    { scope: ["punctuation.paren"], settings: { foreground: "#514f4b" } },
  ],
}

let hl: Promise<HighlighterCore> | null = null
export function getHighlighter() {
  if (!hl) {
    // dynamic import: Shiki lands in its own chunk, off the initial bundle
    hl = (async () => {
      const [{ createHighlighterCore }, { createJavaScriptRegexEngine }] = await Promise.all([
        import("shiki/core"),
        import("shiki/engine/javascript"),
      ])
      return createHighlighterCore({ themes: [light, dark], langs: [clarity], engine: createJavaScriptRegexEngine() })
    })()
  }
  return hl
}
