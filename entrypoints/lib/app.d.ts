interface App {
  select_icon: (img: HTMLImageElement) => void | Promise<void>
  comment_icon?: (container: HTMLElement, position?: InsertPosition | null, type?: string) => void
  g_comment_icon_data?: {
    is_editor: boolean
    editor_insert_callback: ((src: string) => void) | null
  }
}
