import { IconSetController, parseSetTitle } from "../lib/editor/IconSetController.ts"
import { countImages } from "../lib/editor/organizeImages.ts"

import "./icon-upload.css"

export type IconUploadRoot = HTMLElement & { controller?: IconSetController }

export function mountIconUpload() {
  const board = document.querySelector<HTMLElement>(".board_main_view")
  const subject = document.querySelector<HTMLInputElement>('input[name="subject"]')
  if (!board || !subject || board.querySelector(".ruricon-upload")) return () => {}

  const root = document.createElement("section") as IconUploadRoot
  root.className = "ruricon-upload"
  root.setAttribute("aria-label", "아이콘 업로드 및 세트 구성")
  root.innerHTML = `
    <div class="ruricon-upload-heading">아이콘 게시판 · 글쓰기 <span>세트당 권장 20페이지</span></div>
    <p class="ruricon-set-hint" role="status"></p>
    <div class="ruricon-upload-row">
      <label for="ruricon-upload-quota">아이콘 업로드</label>
      <progress id="ruricon-upload-quota" max="100" value="0"></progress>
      <strong class="ruricon-upload-count">0 / 100</strong>
    </div>
    <div class="ruricon-upload-row">
      <span>세트 구성</span>
      <div class="ruricon-set-pages">
        <div class="ruricon-set-list"></div>
        <button type="button" class="ruricon-set-next"></button>
      </div>
    </div>
    <div class="ruricon-upload-row">
      <span>유틸리티</span>
      <button type="button" class="ruricon-organize" title="현재 본문의 이미지를 맨 아래 8열 grid로 모읍니다.">정리</button>
      <button type="button" class="ruricon-split" title="이미지를 90개씩 grid로 나누고 이미지 외 본문은 개요에 보관합니다." hidden>분할</button>
    </div>
    <p class="ruricon-upload-notice" role="status"></p>
    <p class="ruricon-upload-footnote">페이지별 본문은 이 편집 화면에서 보관됩니다. 새로고침하면 사라지며, 게시물은 현재 페이지만 등록됩니다.</p>
  `
  board.prepend(root)

  const hint = root.querySelector<HTMLElement>(".ruricon-set-hint")!
  const quota = root.querySelector<HTMLProgressElement>("progress")!
  const countLabel = root.querySelector<HTMLElement>(".ruricon-upload-count")!
  const list = root.querySelector<HTMLElement>(".ruricon-set-list")!
  const next = root.querySelector<HTMLButtonElement>(".ruricon-set-next")!
  const organize = root.querySelector<HTMLButtonElement>(".ruricon-organize")!
  const split = root.querySelector<HTMLButtonElement>(".ruricon-split")!
  const notice = root.querySelector<HTMLElement>(".ruricon-upload-notice")!
  const frames = new Set<HTMLIFrameElement>()
  const documents = new Set<Document>()
  let queued = false
  let disposed = false

  function scheduleUpdate() {
    if (queued || disposed) return
    queued = true
    queueMicrotask(() => {
      queued = false
      if (!disposed) update()
    })
  }

  const observer = new MutationObserver((records) => {
    if (records.some((record) => !root.contains(record.target))) scheduleUpdate()
  })
  observer.observe(board, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["style", "hidden"],
  })
  board.addEventListener("input", scheduleUpdate)
  board.addEventListener("change", scheduleUpdate)
  subject.addEventListener("input", scheduleUpdate)
  subject.addEventListener("change", syncTitle)
  const readyTimer = window.setInterval(scheduleUpdate, 250)

  function run(action: () => void) {
    try {
      action()
      update()
    } catch (error) {
      notice.textContent =
        error instanceof Error ? error.message : "편집기 본문을 읽거나 전환하지 못했습니다."
    }
  }

  function syncTitle() {
    run(() => root.controller?.syncTitle())
  }

  function update() {
    for (const frame of board!.querySelectorAll("iframe")) {
      if (!frames.has(frame)) {
        frames.add(frame)
        frame.addEventListener("load", scheduleUpdate)
      }
      let doc: Document | null = null
      try {
        doc = frame.contentDocument
      } catch {
        /* Ignore cross-origin frames. */
      }
      if (!doc?.body || documents.has(doc)) continue
      documents.add(doc)
      observer.observe(doc.body, { childList: true, subtree: true })
      doc.addEventListener("input", scheduleUpdate)
    }
    next.disabled = true
    organize.disabled = true
    split.disabled = true
    if (typeof seditor === "undefined") {
      notice.textContent = "편집기를 준비하고 있습니다."
      return
    }
    try {
      root.controller ??= new IconSetController(subject!)
      window.clearInterval(readyTimer)
      root.controller.save()
    } catch {
      notice.textContent = "편집기 본문을 읽지 못했습니다. 페이지 전환을 중단했습니다."
      return
    }
    const controller = root.controller
    organize.disabled = false
    const count = countImages(controller.getHtml(controller.activePage))
    split.hidden =
      controller.isSet || controller.activePage !== 0 || controller.pages.size > 0 || count <= 100
    split.disabled = false
    const set = parseSetTitle(subject!.value)
    quota.value = Math.min(count, 100)
    countLabel.textContent = `${count} / 100`
    root.dataset.full = String(count >= 100)
    hint.textContent = controller.isSet
      ? `${set ? `세트 '${set.name}'의` : "제목을 입력해주세요."} ${controller.activePage === 0 ? "개요" : `Slave #${controller.activePage}`} 본문을 작성 중입니다.`
      : "#1을 시작하면 현재 본문은 Main으로 보관되고 새 Slave 페이지를 작성합니다."
    const entries: [number, string][] = [...controller.pages].sort(([a], [b]) => a - b)
    if (controller.main) entries.unshift([0, controller.main.html])
    let index = 0
    for (const [page, html] of entries) {
      let button = list.querySelector<HTMLButtonElement>(`[data-page="${page}"]`)
      if (!button) {
        button = document.createElement("button")
        button.type = "button"
        button.dataset.page = String(page)
        button.addEventListener("click", () => run(() => controller.selectPage(page)))
      }
      button.className = page === controller.activePage ? "ruricon-set-current" : "ruricon-set-page"
      button.setAttribute("aria-pressed", String(page === controller.activePage))
      const label = page === 0 ? (controller.isSet ? "개요" : "단일 페이지") : `#${page}`
      button.textContent =
        page === 0 && controller.isSet ? label : `${label} · ${countImages(html)}개`
      if (list.children[index] !== button) list.insertBefore(button, list.children[index] ?? null)
      index++
    }
    for (const button of list.querySelectorAll<HTMLButtonElement>("button")) {
      if (!entries.some(([page]) => page === Number(button.dataset.page))) button.remove()
    }
    const nextPage = Math.max(0, ...controller.pages.keys()) + 1
    next.textContent = controller.isSet ? `+ #${nextPage} 추가` : "+ #1 시작"
    next.disabled = !Number.isSafeInteger(nextPage)
    next.title = controller.isSet
      ? "현재 본문을 저장하고 새 페이지의 빈 본문으로 전환합니다."
      : "현재 본문을 Main으로 저장하고 빈 #1 Slave로 전환합니다."
    notice.textContent =
      count >= 100
        ? `${count > 100 ? `${count - 100}개 초과했습니다. ` : "100개를 채웠습니다. "}남은 아이콘은 다음 페이지에 작성해주세요.`
        : ""
  }

  next.addEventListener("click", () => run(() => root.controller?.addPage()))
  organize.addEventListener("click", () => run(() => root.controller?.organizeImages()))
  split.addEventListener("click", () => run(() => root.controller?.splitImages()))
  update()

  return () => {
    disposed = true
    window.clearInterval(readyTimer)
    observer.disconnect()
    board.removeEventListener("input", scheduleUpdate)
    board.removeEventListener("change", scheduleUpdate)
    subject.removeEventListener("input", scheduleUpdate)
    subject.removeEventListener("change", syncTitle)
    for (const frame of frames) frame.removeEventListener("load", scheduleUpdate)
    for (const doc of documents) doc.removeEventListener("input", scheduleUpdate)
    root.remove()
  }
}
