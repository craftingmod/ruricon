import type { SEditor } from "./editor/EditorMock.ts"

declare global {
  var seditor: SEditor
  var $: typeof import("jquery")
}
