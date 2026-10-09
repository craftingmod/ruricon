import type { SEditor } from "./editor/EditorMock.ts"

declare global {
  /* only use on edit mode */
  var seditor: SEditor
  var $: typeof import("jquery")
  var app: App
}