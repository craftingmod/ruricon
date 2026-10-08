import "./icon-upload.css"

export function parseSetTitle(title: string) {
  const match = title.trim().match(/^(.+?)\s+#([1-9]\d*)$/)
  if (!match || !Number.isSafeInteger(Number(match[2]))) return null
  return { name: match[1].trim(), page: Number(match[2]) }
}

export function mountIconUpload() {
  const board = document.querySelector<HTMLElement>(".board_main_view")
  const subject = document.querySelector<HTMLInputElement>('input[name="subject"]')
  if (!board || !subject || board.querySelector(".ruricon-upload")) return () => {}

  const panel = document.createElement("section")
  panel.className = "ruricon-upload"
  panel.setAttribute("aria-label", "아이콘 업로드 및 세트 구성")
  panel.innerHTML = `
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
        <span class="ruricon-set-current" aria-current="page"></span>
        <button type="button" class="ruricon-set-next"></button>
      </div>
    </div>
    <p class="ruricon-upload-notice" role="status"></p>
    <p class="ruricon-upload-footnote">제목 끝에 #1, #2…를 붙여 세트 페이지를 구분합니다. 이전 게시물 조회와 자동 연결·분할 등록은 지원하지 않습니다.</p>
  `
  board.prepend(panel)

  const hint = panel.querySelector<HTMLElement>(".ruricon-set-hint")!
  const quota = panel.querySelector<HTMLProgressElement>("progress")!
  const countLabel = panel.querySelector<HTMLElement>(".ruricon-upload-count")!
  const current = panel.querySelector<HTMLElement>(".ruricon-set-current")!
  const next = panel.querySelector<HTMLButtonElement>("button")!
  const notice = panel.querySelector<HTMLElement>(".ruricon-upload-notice")!
  const frames = new Map<HTMLIFrameElement, Document | null>()
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
    if (records.some((record) => !panel.contains(record.target))) scheduleUpdate()
  })
  observer.observe(board, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["contenteditable", "style", "hidden"],
  })
  board.addEventListener("input", scheduleUpdate)
  board.addEventListener("change", scheduleUpdate)
  subject.addEventListener("input", scheduleUpdate)
  subject.addEventListener("change", scheduleUpdate)

  function update() {
    const images = new Set<Element>()
    let hasEditor = false
    function collectImages(root: ParentNode) {
      for (const editor of root.querySelectorAll('[contenteditable="true"]')) {
        if (!editor.getClientRects().length) continue
        hasEditor = true
        for (const image of editor.querySelectorAll("img")) images.add(image)
      }
    }
    collectImages(board!)
    for (const frame of board!.querySelectorAll("iframe")) {
      if (!frames.has(frame)) frame.addEventListener("load", scheduleUpdate)
      let doc: Document | null = null
      try {
        doc = frame.contentDocument
      } catch {
        // Cross-origin frames are not editor content.
      }
      frames.set(frame, doc)
      if (!doc?.body) continue
      if (!documents.has(doc)) {
        documents.add(doc)
        observer.observe(doc.body, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ["contenteditable"],
        })
        doc.addEventListener("input", scheduleUpdate)
      }
      if (!frame.getClientRects().length) continue
      if (doc.designMode.toLowerCase() === "on" || doc.body.isContentEditable) {
        hasEditor = true
        for (const image of doc.body.querySelectorAll("img")) images.add(image)
      } else {
        collectImages(doc)
      }
    }
    const source = board!.querySelector<HTMLTextAreaElement>('textarea[name="content"]')
    // ponytail: source mode uses the content textarea; adapt if the site changes editor fields.
    const count =
      source && !source.hidden && source.getClientRects().length
        ? new DOMParser().parseFromString(source.value, "text/html").querySelectorAll("img").length
        : hasEditor
          ? images.size
          : source
            ? new DOMParser().parseFromString(source.value, "text/html").querySelectorAll("img")
                .length
            : 0
    const set = parseSetTitle(subject!.value)
    quota.value = Math.min(count, 100)
    countLabel.textContent = `${count} / 100`
    panel.dataset.full = String(count >= 100)
    hint.textContent = set
      ? `세트 '${set.name}'의 #${set.page} 페이지를 작성 중입니다.`
      : "제목 끝에 #번호를 붙이면 세트 페이지로 표시됩니다."
    current.textContent = `${set ? `#${set.page}` : "단일 페이지"} · ${count}개 (작성 중)`
    next.textContent = set ? `+ #${set.page + 1} 추가` : "+ #1 시작"
    next.disabled = !subject!.value.trim() || (!!set && set.page === Number.MAX_SAFE_INTEGER)
    next.title = "현재 본문을 유지하고 제목의 페이지 번호만 변경합니다."
    notice.textContent =
      count >= 100
        ? `${count > 100 ? `${count - 100}개 초과했습니다. ` : "100개를 채웠습니다. "}남은 아이콘은 #${set ? set.page + 1 : 2} 게시물로 나누어 작성해주세요. 자동으로 분할되지 않습니다.`
        : "게시물당 100개 기준입니다. 실제 업로드 제한은 게시판 정책을 따릅니다."
  }

  next.addEventListener("click", () => {
    const set = parseSetTitle(subject.value)
    const title = `${set?.name ?? subject.value.trim()} #${set ? set.page + 1 : 1}`
    const titleLimit =
      subject.maxLength >= 0
        ? subject.maxLength
        : Number(document.querySelector<HTMLInputElement>('input[name="subject_limit"]')?.value) ||
          45
    if (title.length > titleLimit) {
      notice.textContent = "페이지 번호를 붙일 수 있도록 제목을 줄여주세요."
      return
    }
    subject.value = title
    subject.dispatchEvent(new Event("input", { bubbles: true }))
    subject.dispatchEvent(new Event("change", { bubbles: true }))
    subject.focus()
  })
  update()

  return () => {
    disposed = true
    observer.disconnect()
    board.removeEventListener("input", scheduleUpdate)
    board.removeEventListener("change", scheduleUpdate)
    subject.removeEventListener("input", scheduleUpdate)
    subject.removeEventListener("change", scheduleUpdate)
    for (const frame of frames.keys()) frame.removeEventListener("load", scheduleUpdate)
    for (const doc of documents) doc.removeEventListener("input", scheduleUpdate)
    panel.remove()
  }
}
