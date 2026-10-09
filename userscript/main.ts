import { editorPages } from "../entrypoints/lib/constants.ts"
import { mountCommentIconHook } from "../entrypoints/scripts/comment-icon.tsx"
import { main as editorMain } from "../entrypoints/scripts/ruli-editor.ts"

const commentCleanup = mountCommentIconHook()
const isEditor = editorPages.some((page) =>
  location.href.split(/[?#]/)[0].startsWith(page.replace("*", "")),
)
void (isEditor ? editorMain() : Promise.resolve(() => {})).then((cleanup) => {
  window.addEventListener("pagehide", (event) => {
    if (!event.persisted) {
      cleanup()
      commentCleanup()
    }
  })
})
