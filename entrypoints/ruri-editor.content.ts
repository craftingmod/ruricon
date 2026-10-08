import { editorPages } from "./lib/constants.ts"
import { main as editorMain } from "./scripts/ruli-editor.ts"

export default defineContentScript({
  matches: editorPages,
  async main(ctx) {
    console.log("Hello content.")
    const cleanup = await editorMain()
    ctx.onInvalidated(cleanup)
  },
})
