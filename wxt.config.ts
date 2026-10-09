import { resolve } from "node:path"

import preact from "@preact/preset-vite"
import { defineConfig } from "wxt"

import { chromeExec, editorPages } from "./entrypoints/lib/constants.ts"

// See https://wxt.dev/api/config.html
export default defineConfig({
  vite: () => ({
    plugins: [preact({ devToolsEnabled: false, prefreshEnabled: false })],
  }),
  webExt: {
    binaries: {
      chrome: chromeExec, // Use Chrome Beta instead of regular Chrome
    },
    chromiumArgs: ["--remote-debugging-port=8327"],
    startUrls: [editorPages[0]],
    chromiumProfile: resolve(".chrome"),
    keepProfileChanges: true,
    chromiumPort: 8327,
  },
})
