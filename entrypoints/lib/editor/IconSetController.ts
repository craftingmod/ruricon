import { iconBoardId } from "../ruli-constants.ts"
import { createArticle, parseArticleURL, writeArticle, type Article } from "../ruli-utils.ts"
import {
  compileMain,
  compileSlave,
  imageHtml,
  readMain,
  setNameLimit,
  setTitle,
  validateState,
  type IconSetState,
} from "./articleMeta.ts"
import { isEmptyHtml, organizeImages, splitImages } from "./organizeImages.ts"

export function parseSetTitle(title: string) {
  const main = title.trim().match(/^(.+?)\s+\(M\)$/)
  if (main) return { name: main[1].trim(), page: 0, slaveId: undefined }
  const match = title.trim().match(/^(.+?)\s+#([1-9]\d*)(?:\s+\(S([1-9]\d*)\))?$/i)
  if (
    match &&
    Number.isSafeInteger(Number(match[2])) &&
    (match[3] === undefined || Number.isSafeInteger(Number(match[3])))
  )
    return { name: match[1].trim(), page: Number(match[2]), slaveId: match[3] }
  const slave = title.trim().match(/^(.+?)\s+\(S([1-9]\d*)(?:-([1-9]\d*))?\)$/i)
  return slave &&
    Number.isSafeInteger(Number(slave[2])) &&
    (slave[3] === undefined || Number.isSafeInteger(Number(slave[3])))
    ? { name: slave[1].trim(), page: Number(slave[3] ?? 1), slaveId: slave[2] }
    : null
}

export class IconSetController {
  // ponytail: page drafts live in memory; add persistence when reload recovery is needed.
  readonly pages = new Map<number, string>()
  readonly main: { html: string; slaves: Map<number, string> } | null
  mainArticleId: number | null = null
  readonly articleIds = new Map<number, number>()
  publishing = false
  private publishUncertain = false
  activePage: number
  isSet: boolean
  private restoreFailed = false

  constructor(readonly subject: HTMLInputElement) {
    const set = parseSetTitle(subject.value)
    if (!set && /\(S[0-9A-Z]+(?:-[0-9A-Z]+)?\)$/i.test(subject.value.trim()))
      throw new Error("분할 ID는 10진수 규약입니다. 기존 세트는 대표에서 다시 게시해주세요.")
    this.activePage = set?.page ?? 0
    this.main = this.activePage === 0 ? { html: "", slaves: this.pages } : null
    this.isSet = !!set
    if (this.main) {
      const restored = readMain(seditor.getHtml())
      const match = location.pathname.match(/^\/community\/board\/98\/modify\/(\d+)\/?$/)
      this.mainArticleId = match ? Number(match[1]) : null
      if (restored.state) {
        if (
          this.mainArticleId !== null &&
          restored.state.mainArticleId !== null &&
          restored.state.mainArticleId !== this.mainArticleId
        )
          throw new Error("대표 게시글 ID가 일치하지 않습니다.")
        this.mainArticleId ??= restored.state.mainArticleId
        this.subject.value = restored.state.name
        for (const slave of restored.state.slaves) {
          this.pages.set(slave.page, imageHtml(slave.images))
          if (slave.articleId !== null) this.articleIds.set(slave.page, slave.articleId)
        }
        this.isSet = true
      } else if (set) this.subject.value = set.name
    } else if (set) this.subject.value = set.name
    this.subject.maxLength = setNameLimit(
      this.mainArticleId ?? (set?.slaveId ? Number(set.slaveId) : null),
      Math.max(1, this.activePage, ...this.pages.keys()),
    )
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

  syncTitle(page = 0) {
    const limit = setNameLimit(
      this.mainArticleId,
      Math.max(1, page, this.activePage, ...this.pages.keys()),
    )
    this.subject.maxLength = limit
    if (this.subject.value.trim().length > limit)
      throw new Error(`세트명은 ${limit}자 이하로 입력해주세요.`)
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
    if (!Number.isSafeInteger(page) || page < 0) throw new Error("페이지 번호를 확인해주세요.")
    if (page === 0 && !this.main) throw new Error("이 화면에는 대표 본문이 없습니다.")
    if (this.publishing) throw new Error("게시 중에는 페이지를 전환할 수 없습니다.")
    this.syncTitle(page)
    const previous = this.restoreFailed ? this.getHtml(this.activePage) : this.save()
    const html = page === 0 ? this.getHtml(page) : organizeImages(this.getHtml(page), true)
    this.replaceHtml(html, previous)
    if (this.activePage > 0) this.pages.set(this.activePage, organizeImages(previous, true))
    if (page === 0) this.main!.html = html
    else this.pages.set(page, html)
    this.activePage = page
    this.isSet = true
  }

  addPage() {
    this.syncTitle()
    this.selectPage(Math.max(0, ...this.pages.keys()) + 1)
  }

  organizeImages() {
    const previous = this.save()
    const html = organizeImages(previous, this.activePage > 0)
    if (html === previous) return
    this.replaceHtml(html, previous)
    this.save()
  }

  canLoadArticle() {
    return (
      !!this.main &&
      !this.isSet &&
      this.activePage === 0 &&
      this.pages.size === 0 &&
      !this.publishing &&
      !this.restoreFailed &&
      isEmptyHtml(this.main.html)
    )
  }

  loadHtml(html: string) {
    const previous = this.save()
    if (!this.canLoadArticle())
      throw new Error("게시글 불러오기는 빈 단일 페이지에서만 가능합니다.")
    this.replaceHtml(html, previous)
    this.main!.html = html
  }

  splitImages() {
    if (!this.main) return
    if (this.publishing) throw new Error("게시 중에는 분할 구성을 변경할 수 없습니다.")
    const previous = this.save()
    const existing = this.pages.size > 0
    const source = existing
      ? [...this.pages]
          .sort(([a], [b]) => a - b)
          .map(([, html]) => html)
          .join("")
      : previous
    const split = splitImages(source, existing)
    if (!split) return
    this.syncTitle(split.pages.length)
    const page = (existing && this.activePage === 0) || !split.pages.length ? 0 : 1
    if (page !== 0 || this.activePage !== 0)
      this.replaceHtml(page === 0 ? this.main.html : split.pages[0], previous)
    if (!existing) this.main.html = split.mainHtml
    const ids = [...this.articleIds].sort(([a], [b]) => a - b).map(([, id]) => id)
    this.pages.clear()
    this.articleIds.clear()
    // Keep surplus published IDs in this session for reuse if the set grows again.
    ids.forEach((id, index) => this.articleIds.set(index + 1, id))
    split.pages.forEach((html, index) => this.pages.set(index + 1, html))
    this.activePage = page
    this.subject.maxLength = setNameLimit(this.mainArticleId, Math.max(1, split.pages.length))
    this.isSet = true
  }

  snapshot(): IconSetState {
    if (!this.main) throw new Error("분할은 대표 편집 화면에서 수정해주세요.")
    this.syncTitle()
    this.save()
    const state: IconSetState = {
      version: 1,
      name: this.subject.value.trim(),
      boardId: iconBoardId,
      mainArticleId: this.mainArticleId,
      slaves: [...this.pages]
        .sort(([a], [b]) => a - b)
        .map(([page, html]) => ({
          page,
          articleId: this.articleIds.get(page) ?? null,
          images: [
            ...new DOMParser()
              .parseFromString(organizeImages(html, true), "text/html")
              .querySelectorAll("img[src]"),
          ].map((image) => image.getAttribute("src")!),
        })),
    }
    validateState(state)
    return state
  }

  async publish(
    category: number,
    settings: Partial<Article> = {},
    onProgress?: (message: string) => void,
  ) {
    if (this.publishing) throw new Error("이미 게시 중입니다.")
    if (this.publishUncertain)
      throw new Error("게시 결과가 불명확합니다. 게시판에서 확인한 뒤 대표 수정 화면을 열어주세요.")
    if (!Number.isSafeInteger(category) || category < 1)
      throw new Error("게시글 분류를 선택해주세요.")
    const state = this.snapshot()
    const mainHtml = readMain(this.main!.html).html
    setTitle(state.name, 0, state.mainArticleId)
    // Check known title lengths before init; check the actual new ID before posting Slaves.
    for (const slave of state.slaves) setTitle(state.name, slave.page, state.mainArticleId ?? 1)
    const post = async (content: string, page: number, id: number | null) => {
      const article = createArticle(
        {
          board_id: iconBoardId,
          category,
          subject: setTitle(state.name, page, state.mainArticleId),
          content,
          raw_tags: [
            "ruricon",
            page === 0 ? "ruriconM" : "ruriconS",
            ...(state.mainArticleId === null ? [] : [`ruricon${state.mainArticleId}`]),
          ],
        },
        id !== null,
      )
      const { set_notify, is_spoiler, thumbnail_off, tag_input } = settings
      Object.assign(article, {
        set_notify: set_notify ?? article.set_notify,
        is_spoiler: is_spoiler ?? article.is_spoiler,
        thumbnail_off: thumbnail_off ?? article.thumbnail_off,
        tag_input: tag_input ? `${article.tag_input} ${tag_input}` : article.tag_input,
      })
      let result
      try {
        const label = page === 0 ? "대표" : `분할 #${page}`
        onProgress?.(`${label} ${id === null ? "생성" : "수정"} 중입니다.`)
        result = await writeArticle(article, {
          ...(id === null ? {} : { articleId: id }),
          onWait: (seconds) =>
            onProgress?.(
              seconds > 0
                ? `${label} 생성까지 ${seconds}초 대기 중입니다. (새 글 간격 35초)`
                : `${label} 생성 중입니다.`,
            ),
        })
      } catch {
        this.publishUncertain = true
        throw new Error(
          "게시 응답을 받지 못했습니다. 게시판에서 결과를 확인한 뒤 대표 수정 화면을 열어주세요.",
        )
      }
      if (!result.success) throw new Error(result.reason || "게시 요청이 실패했습니다.")
      try {
        const parsed = parseArticleURL(result.url)
        if (
          parsed.boardId !== iconBoardId ||
          !Number.isSafeInteger(parsed.articleId) ||
          parsed.articleId < 1 ||
          (id !== null && parsed.articleId !== id) ||
          (page > 0 &&
            (parsed.articleId === state.mainArticleId ||
              [...this.articleIds].some(
                ([otherPage, otherId]) => otherPage !== page && otherId === parsed.articleId,
              )))
        )
          throw new Error("게시 응답의 ID를 확인할 수 없습니다.")
        return parsed.articleId
      } catch {
        this.publishUncertain = true
        throw new Error(
          "게시 응답의 ID가 불명확합니다. 게시판에서 결과를 확인한 뒤 대표 수정 화면을 열어주세요.",
        )
      }
    }
    this.publishing = true
    this.isSet = true
    try {
      if (state.mainArticleId === null) {
        this.mainArticleId = await post(compileMain(mainHtml, state), 0, null)
        state.mainArticleId = this.mainArticleId
        this.subject.maxLength = setNameLimit(this.mainArticleId, Math.max(1, ...this.pages.keys()))
      }
      for (const slave of state.slaves) setTitle(state.name, slave.page, state.mainArticleId)
      for (const slave of state.slaves) {
        slave.articleId = await post(
          compileSlave(slave.images, state.mainArticleId!),
          slave.page,
          slave.articleId,
        )
        this.articleIds.set(slave.page, slave.articleId)
      }
      await post(compileMain(mainHtml, state), 0, state.mainArticleId)
      this.isSet = true
      return state.mainArticleId
    } finally {
      this.publishing = false
    }
  }

  getHtml(page: number) {
    return page === 0 ? (this.main?.html ?? "") : (this.pages.get(page) ?? "")
  }
}
