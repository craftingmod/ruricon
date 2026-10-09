import { readFileSync } from "node:fs"

import { defineConfig } from "vite"

import { mobileDomain, pcDomain } from "./entrypoints/lib/ruli-constants.ts"

const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"))
const metadata = [
  "// ==UserScript==",
  "// @name Rulicon",
  "// @namespace rulicon",
  `// @version ${version}`,
  "// @description Ruliweb icon editor tools",
  ...[pcDomain, mobileDomain].map((domain) => `// @match https://${domain}/*`),
  "// @run-at document-idle",
  "// @grant none",
  "// @sandbox raw",
  "// ==/UserScript==",
].join("\n")

export default defineConfig({
  publicDir: false,
  build: {
    outDir: ".output/userscript",
    lib: {
      entry: "userscript/main.ts",
      name: "Rulicon",
      formats: ["iife"],
      fileName: () => "rulicon.user.js",
    },
  },
  plugins: [
    {
      name: "userscript-bundle",
      enforce: "post",
      generateBundle(_options, bundle) {
        const script = bundle["rulicon.user.js"]
        if (!script || script.type !== "chunk") throw new Error("Missing userscript bundle")
        let css = ""
        for (const [name, file] of Object.entries(bundle)) {
          if (file.type === "asset" && name.endsWith(".css")) {
            css += file.source
            delete bundle[name]
          }
        }
        script.code = `${metadata}\n(() => {\nconst style = document.createElement("style");\nstyle.textContent = ${JSON.stringify(css)};\ndocument.head.append(style);\n${script.code}\n})();\n`
      },
    },
  ],
})
