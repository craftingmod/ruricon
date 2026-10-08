import { defineConfig } from "wxt"
import { resolve } from "node:path"

// See https://wxt.dev/api/config.html
export default defineConfig({
  webExt: {
    binaries: {
      chrome: "C:/Program Files/Google/Chrome Beta/Application/chrome.exe", // Use Chrome Beta instead of regular Chrome
    },
    chromiumProfile: resolve(".chrome"),
    keepProfileChanges: true,
  },
})
