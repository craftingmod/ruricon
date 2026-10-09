import { mobileDomain, pcDomain } from "./lib/ruli-constants.ts"
import { mountCommentIconHook } from "./scripts/comment-icon.tsx"

export default defineContentScript({
  matches: [`https://${pcDomain}/*`, `https://${mobileDomain}/*`],
  world: "MAIN",
  main() {
    const cleanup = mountCommentIconHook()
    window.addEventListener("pagehide", (event) => {
      if (!event.persisted) cleanup()
    })
  },
})
