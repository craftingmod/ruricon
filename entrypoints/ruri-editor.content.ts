import { editorPages } from "./lib/constants.ts"
import { main as editorMain } from "./scripts/ruli-editor.ts"


/**
 * Icon editor hook
 */
export default defineContentScript({
  matches: editorPages,
  world: "MAIN",
  async main() {
    console.log("Hello content.")
    const cleanup = await editorMain()
    window.addEventListener("pagehide", (event) => {
      if (!event.persisted) cleanup()
    })
  },
})
