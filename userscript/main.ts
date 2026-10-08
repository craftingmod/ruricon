import { main as editorMain } from "../entrypoints/scripts/ruli-editor.ts"

void editorMain().then((cleanup) => {
  window.addEventListener("pagehide", (event) => {
    if (!event.persisted) cleanup()
  })
})
