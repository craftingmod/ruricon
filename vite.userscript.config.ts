import { readFileSync } from "node:fs"

import preact from "@preact/preset-vite"
import { defineConfig } from "vite"
import monkey from "vite-plugin-monkey"

import { mobileDomain, pcDomain } from "./entrypoints/lib/ruli-constants.ts"

const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"))
const userscriptUrl = "https://cdn.jsdelivr.net/gh/craftingmod/rulicon@userscript/rulicon"

export default defineConfig({
  publicDir: false,
  build: {
    outDir: ".output/userscript",
    minify: true,
  },
  plugins: [
    preact({ devToolsEnabled: false, prefreshEnabled: false }),
    monkey({
      entry: "userscript/main.ts",
      align: false,
      userscript: {
        name: "Rulicon",
        namespace: "rulicon",
        version,
        description: "Ruliweb icon extension",
        homepage: "https://github.com/craftingmod/rulicon",
        match: [pcDomain, mobileDomain].map((domain) => `https://${domain}/*`),
        "run-at": "document-idle",
        grant: "none",
        sandbox: "raw",
        updateURL: `${userscriptUrl}.meta.js`,
        downloadURL: `${userscriptUrl}.user.js`,
      },
      build: {
        fileName: "rulicon.user.js",
        metaFileName: true,
        autoGrant: false,
      },
    }),
  ],
})
