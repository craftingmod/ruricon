export interface SEditor {
  getHtml: () => string
  setHtml: (str: string) => void
  ref: HTMLElement
}
