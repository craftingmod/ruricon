import { organizeImages, splitImages } from "./organizeImages.ts"

export function parseSetTitle(title: string) {
  const main = title.trim().match(/^(.+?)\s+\(M\)$/)
  if (main) return { name: main[1].trim(), page: 0, slaveId: undefined }
  const match = title.trim().match(/^(.+?)\s+#([1-9]\d*)(?:\s+\(S([0-9A-Z]+)\))?$/i)
  if (!match || !Number.isSafeInteger(Number(match[2]))) return null
  return { name: match[1].trim(), page: Number(match[2]), slaveId: match[3] }
}

export class IconSetController {
  // ponytail: page drafts live in memory; add persistence when reload recovery is needed.
  readonly pages = new Map<number, string>()
  readonly main: { html: string; slaves: Map<number, string> } | null
  private slaveId: string | undefined
  activePage: number
  isSet: boolean
  private restoreFailed = false

  constructor(readonly subject: HTMLInputElement) {
    const set = parseSetTitle(subject.value)
    this.activePage = set?.page ?? 0
    this.main = this.activePage === 0 ? { html: "", slaves: this.pages } : null
    this.slaveId = set?.slaveId
    this.isSet = !!set
    this.save()
  }

  save() {
    if (this.restoreFailed)
      throw new Error("본문 복원에 실패했습니다. 저장된 페이지를 다시 선택해주세요.")
    const html = seditor.getHtml()
    if (this.activePage === 0) this.main!.html = html
    else this.pages.set(this.activePage, html)
    return html
  }

  syncTitle() {
    const set = parseSetTitle(this.subject.value)
    if (!set) {
      if (this.isSet && this.subject.value.trim()) this.writeTitle(this.pageTitle(this.activePage))
      return
    }
    const page = set.page
    this.slaveId = set.slaveId ?? this.slaveId
    this.isSet = true
    if (page === this.activePage) return
    if (page === 0 || this.activePage === 0 || this.pages.has(page)) {
      this.selectPage(page)
    } else {
      const html = this.save()
      this.pages.delete(this.activePage)
      this.pages.set(page, html)
      this.activePage = page
    }
  }

  private pageTitle(page: number) {
    if (!Number.isSafeInteger(page) || page < 0) throw new Error("페이지 번호를 확인해주세요.")
    const name = parseSetTitle(this.subject.value)?.name ?? this.subject.value.trim()
    if (!name) return ""
    const title =
      page === 0 ? `${name} (M)` : `${name} #${page}${this.slaveId ? ` (S${this.slaveId})` : ""}`
    const limit =
      this.subject.maxLength >= 0
        ? this.subject.maxLength
        : Number(document.querySelector<HTMLInputElement>('input[name="subject_limit"]')?.value) ||
          45
    if (title.length > limit) throw new Error("페이지 번호를 붙일 수 있도록 제목을 줄여주세요.")
    return title
  }

  private writeTitle(title: string) {
    this.subject.value = title
    this.subject.dispatchEvent(new Event("input", { bubbles: true }))
    this.subject.dispatchEvent(new Event("change", { bubbles: true }))
  }

  private replaceHtml(html: string, previous: string) {
    try {
      seditor.setHtml(html)
    } catch (error) {
      // Keep the saved HTML even if the editor fails to restore it.
      try {
        seditor.setHtml(previous)
        this.restoreFailed = false
      } catch {
        this.restoreFailed = true
      }
      throw error
    }
    this.restoreFailed = false
  }

  selectPage(page: number) {
    if (page === 0 && !this.main) throw new Error("이 화면에는 Main 본문이 없습니다.")
    const title = this.pageTitle(page)
    const previous = this.restoreFailed ? this.getHtml(this.activePage) : this.save()
    const html = this.getHtml(page)
    this.replaceHtml(html, previous)
    if (page === 0) this.main!.html = html
    else this.pages.set(page, html)
    this.activePage = page
    this.isSet = true
    this.writeTitle(title)
  }

  addPage() {
    this.syncTitle()
    this.selectPage(Math.max(0, ...this.pages.keys()) + 1)
  }

  organizeImages() {
    const previous = this.save()
    const html = organizeImages(previous)
    if (html === previous) return
    this.replaceHtml(html, previous)
    this.save()
  }

  splitImages() {
    if (this.isSet || this.activePage !== 0 || !this.main || this.pages.size) return
    const previous = this.save()
    const split = splitImages(previous)
    if (!split) return
    this.pageTitle(split.pages.length)
    const title = this.pageTitle(1)
    this.replaceHtml(split.pages[0], previous)
    this.main.html = split.mainHtml
    split.pages.forEach((html, index) => this.pages.set(index + 1, html))
    this.activePage = 1
    this.isSet = true
    this.writeTitle(title)
  }

  getHtml(page: number) {
    return page === 0 ? (this.main?.html ?? "") : (this.pages.get(page) ?? "")
  }
}
