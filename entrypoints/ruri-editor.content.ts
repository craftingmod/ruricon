import { editorPages } from "./lib/constants.ts"
import { main as editorMain } from "./scripts/ruli-editor.ts"

export default defineContentScript({
  matches: editorPages,
  main() {
    console.log("Hello content.")
    return editorMain()
  },
})
