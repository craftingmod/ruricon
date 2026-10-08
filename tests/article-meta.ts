import {
  compileMain,
  decodeState,
  encodeState,
  readMain,
  setTitle,
  setNameLimit,
  type IconSetState,
} from "../entrypoints/lib/editor/articleMeta.ts"
import { IconSetController } from "../entrypoints/lib/editor/IconSetController.ts"
import { createArticle, writeArticle } from "../entrypoints/lib/ruli-utils.ts"
import { mountIconUpload } from "../entrypoints/scripts/icon-upload.ts"

function assert(value: unknown, message: string) {
  if (!value) throw new Error(message)
}
function rejects(fn: () => unknown, message: string) {
  let failed = false
  try {
    fn()
  } catch {
    failed = true
  }
  assert(failed, message)
}
async function check() {
  const state: IconSetState = {
    version: 1,
    name: "냥냥😙콘",
    boardId: 98,
    mainArticleId: null,
    slaves: [
      {
        page: 1,
        articleId: null,
        images: ["https://example.invalid/a.gif?x=1&y=2", "https://example.invalid/a.gif?x=1&y=2"],
      },
    ],
  }
  const encoded = encodeState(state)
  assert(
    /^[\w-]+$/.test(encoded) && JSON.stringify(decodeState(encoded)) === JSON.stringify(state),
    "한글·이모지 base64url 왕복",
  )
  const body = '\n<p title="a > b">사용자 &amp; 본문</p><!-- 그대로 -->\n<img src="user.png">'
  const compiled = compileMain(body, state)
  assert(readMain(compiled).html === body, "사용자 HTML 원문 보존")
  assert(compileMain(compiled, state) === compiled, "재컴파일 시 중복·자기 포함 없음")
  rejects(() => readMain(compiled + compiled), "중복 메타데이터 거부")
  rejects(() => readMain(body + compiled), "불명확한 메타데이터 위치 거부")
  rejects(() => decodeState("broken!"), "인코딩 오류 거부")
  rejects(
    () => encodeState({ ...state, version: 2 } as unknown as IconSetState),
    "미지원 버전 거부",
  )
  rejects(
    () => encodeState({ ...state, slaves: [...state.slaves, ...state.slaves] }),
    "중복 페이지 거부",
  )
  rejects(
    () =>
      encodeState({
        ...state,
        slaves: [{ page: 1, articleId: null, images: ["javascript:alert(1)"] }],
      }),
    "이미지 신뢰 경계",
  )
  assert(
    setNameLimit() === 36 &&
      setNameLimit(4989) === 36 &&
      setNameLimit(10000) === 35 &&
      setNameLimit(4989, 10) === 35,
    "세트명 제한은 기본 36자, ID 또는 index 자릿수만큼 축소",
  )
  assert(
    setTitle("가".repeat(36), 1, 4989) === "가".repeat(36) + "1 (S4989)",
    "세트명 뒤에 index 배치",
  )
  assert(setTitle("가".repeat(35), 1, 10000).length === 45, "5자리 ID 제목 45자")
  assert(setTitle("가".repeat(35), 10, 4989).length === 45, "2자리 index 제목 45자")
  rejects(() => setTitle("가".repeat(37), 0, null), "세트명 36자 제한")
  rejects(() => setTitle("가".repeat(36), 1, 10000), "5자리 ID면 세트명 35자 제한")

  const subject = document.createElement("input")
  subject.name = "subject"
  subject.value = "냥냥콘"
  const category = document.createElement("input")
  category.name = "category"
  category.value = "8"
  const form = document.createElement("form")
  const board = document.createElement("div")
  board.className = "board_main_view"
  const editor = document.createElement("div")
  editor.contentEditable = "true"
  board.append(editor)
  const rawSubmit = document.createElement("button")
  rawSubmit.id = "write_submit"
  rawSubmit.className = "site-yellow-button"
  rawSubmit.type = "submit"
  rawSubmit.innerHTML = "<span>등록</span>"
  rawSubmit.style.setProperty("opacity", "0.8", "important")
  const registration = document.createElement("div")
  registration.append(rawSubmit)
  form.append(subject, category, board, registration)
  document.body.append(form)
  let html = body
  globalThis.seditor = {
    ref: editor,
    getHtml: () => html,
    setHtml: (value) => {
      html = value
    },
  }
  const controller = new IconSetController(subject)
  controller.addPage()
  html =
    '<p>분할 텍스트</p><img src="https://example.invalid/a.gif"><img src="https://example.invalid/a.gif">'
  controller.addPage()
  html = '<img src="https://example.invalid/b.gif">'
  const activeHtml = html
  const requests: { path: string; params: URLSearchParams; time: number }[] = []
  const originalFetch = globalThis.fetch
  const originalNow = Date.now
  const originalTimeout = globalThis.setTimeout
  let now = originalNow()
  Date.now = () => now
  globalThis.setTimeout = ((handler: TimerHandler, delay?: number, ...args: unknown[]) => {
    if (delay === 1000) {
      return originalTimeout(() => {
        now += 1000
        if (typeof handler === "function") handler(...args)
      }, 0)
    }
    return originalTimeout(handler, delay, ...args)
  }) as typeof setTimeout
  const progress: string[] = []
  let failSecond = true
  let pause: (() => void) | undefined
  globalThis.fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : input.toString()
    const path = new URL(url).pathname
    const params = new URLSearchParams(init?.body as URLSearchParams)
    requests.push({ path, params, time: now })
    if (pause) {
      const release = pause
      pause = undefined
      await new Promise<void>((resolve) => {
        release()
        setTimeout(resolve, 10)
      })
    }
    const content = params.get("content") ?? ""
    if (
      failSecond &&
      content.includes("https://example.invalid/b.gif") &&
      path.endsWith("/write")
    ) {
      return {
        redirected: false,
        url,
        status: 200,
        text: async () => '<p class="desc">실패</p>',
      } as Response
    }
    const id = path.includes("modify/")
      ? Number(path.split("/").at(-1))
      : params.get("subject")?.endsWith("(M)")
        ? 2678
        : content.includes("https://example.invalid/a.gif")
          ? 2679
          : content.includes("https://example.invalid/b.gif")
            ? 2680
            : 2681
    return {
      redirected: true,
      url: `https://bbs.ruliweb.com/community/board/98/read/${id}`,
      status: 200,
      text: async () => "",
    } as Response
  }
  try {
    let failed = false
    try {
      await controller.publish(8, {}, (message) => progress.push(message))
    } catch {
      failed = true
    }
    assert(
      failed && controller.mainArticleId === 2678 && controller.articleIds.get(1) === 2679,
      "부분 성공 ID 보관",
    )
    assert(
      requests.length === 3 &&
        requests[0].path.endsWith("/write") &&
        requests[0].params.get("subject") === "냥냥콘 (M)" &&
        readMain(requests[0].params.get("content")!).state?.mainArticleId === null,
      "대표 init 후 분할 게시, 별도 재조회 없음",
    )
    assert(
      requests[0].params.get("tag_input") === "#ruricon #ruriconM",
      "대표 init은 ID 확보 전 공통·Master 태그",
    )
    assert(
      requests[1].params.get("tag_input") === "#ruricon #ruriconS #ruricon2678" &&
        requests[2].params.get("tag_input") === "#ruricon #ruriconS #ruricon2678",
      "분할 생성에 대표의 10진수 ID 태그",
    )
    assert(
      requests[1].time - requests[0].time === 35_000 &&
        requests[2].time - requests[1].time === 35_000,
      "새 글 생성은 35초 간격",
    )
    assert(
      progress.some((message) => message.includes("35초 대기")) &&
        progress.some((message) => message.includes("1초 대기")),
      "초 단위 대기 진행 표시",
    )
    assert(
      html === activeHtml && controller.activePage === 2 && subject.value === "냥냥콘",
      "게시 중 편집 페이지 보존",
    )
    failSecond = false
    requests.length = 0
    const retryTime = now
    await controller.publish(8, { tag_input: "#사용자태그" })
    assert(
      requests.map((r) => r.path).join("|") ===
        "/community/board/98/modify/2679|/community/board/98/write|/community/board/98/modify/2678",
      "재시도는 기존 ID 수정 및 최종 대표 갱신",
    )
    assert(
      requests[0].params.get("tag_input") === "#ruricon #ruriconS #ruricon2678 #사용자태그" &&
        requests[1].params.get("tag_input") === "#ruricon #ruriconS #ruricon2678 #사용자태그" &&
        requests[2].params.get("tag_input") === "#ruricon #ruriconM #ruricon2678 #사용자태그",
      "분할 수정과 대표 최종 수정에 역할·ID 태그, 기존 사용자 태그 보존",
    )
    assert(
      requests[0].time === retryTime &&
        requests[1].time === retryTime + 35_000 &&
        requests[2].time === requests[1].time,
      "실패 후 생성 대기는 유지하고 수정은 즉시 실행",
    )
    const final = requests.at(-1)!.params.get("content")!
    const restored = readMain(final)
    assert(
      restored.html === body && restored.state?.slaves[1].articleId === 2680,
      "최종 메타데이터 및 대표 원문",
    )
    assert(
      !("html" in restored.state!) && !JSON.stringify(restored.state).includes("사용자"),
      "상태에 대표 HTML 없음",
    )
    assert(
      requests[0].params.get("subject") === "냥냥콘1 (S2678)" &&
        requests[1].params.get("subject") === "냥냥콘2 (S2678)",
      "분할 제목은 대표 ID와 각 페이지 index 포함",
    )
    assert(
      requests[0].params.get("content")?.includes("분할 텍스트") === false,
      "분할의 사용자 텍스트는 게시하지 않음",
    )
    for (const request of requests.slice(0, 2)) {
      const slave = new DOMParser().parseFromString(request.params.get("content")!, "text/html")
      assert(
        slave.querySelectorAll("a").length === 1 &&
          slave.querySelector("a")?.getAttribute("href") === "/community/board/98/read/2678" &&
          slave.querySelector("a")?.textContent === "대표로 이동",
        "모든 분할에 대표 링크 생성",
      )
    }
    const dom = new DOMParser().parseFromString(final, "text/html")
    assert(dom.querySelectorAll('[data-meta="ruricon-pages"] a').length === 2, "페이지 DOM 생성")
    html = final
    subject.value = "냥냥콘 (M)"
    const resumed = new IconSetController(subject)
    assert(
      resumed.mainArticleId === 2678 && resumed.pages.size === 2 && subject.maxLength === 36,
      "재편집 시 상태 복원",
    )
    assert(resumed.snapshot().slaves[0].images.length === 2, "이미지 중복 보존")
    const cleanup = mountIconUpload()
    const bundle = registration.querySelector<HTMLButtonElement>(".ruricon-bundle-submit")!
    assert(
      bundle.className === "ruricon-bundle-submit" && rawSubmit.className === "site-yellow-button",
      "묶음 등록은 커스텀 클래스만 사용하고 기본 등록 클래스는 보존",
    )
    assert(
      getComputedStyle(bundle).backgroundColor === "rgb(255, 255, 255)" &&
        getComputedStyle(bundle).color === "rgb(36, 86, 156)",
      "묶음 등록은 도구의 흰 배경·파란 글자 스타일",
    )
    assert(
      !bundle.hidden &&
        bundle.textContent === "묶음 등록" &&
        rawSubmit.innerHTML === "Raw 등록" &&
        rawSubmit.style.opacity === "0.4",
      "등록 버튼 parent에 묶음 등록 및 Raw 표시",
    )
    const root = board.querySelector<HTMLElement>(".ruricon-upload")! as HTMLElement & {
      controller: IconSetController
    }
    root.controller = resumed
    resumed.pages.set(3, '<img src="https://example.invalid/c.gif">')
    const notices: string[] = []
    const noticeObserver = new MutationObserver(() => {
      notices.push(root.querySelector(".ruricon-upload-notice")?.textContent ?? "")
    })
    noticeObserver.observe(root, { childList: true, subtree: true })
    let locked = false
    pause = () => {
      const submit = new Event("submit", { cancelable: true })
      form.dispatchEvent(submit)
      locked =
        subject.disabled &&
        editor.contentEditable === "false" &&
        bundle.disabled &&
        rawSubmit.disabled &&
        submit.defaultPrevented
    }
    bundle.click()
    for (let attempt = 0; attempt < 200; attempt++) {
      await new Promise((resolve) => originalTimeout(resolve, 10))
      if (!root.hasAttribute("aria-busy")) break
    }
    noticeObserver.disconnect()
    assert(
      notices.some((message) => message.includes("분할 #3 생성까지 35초")),
      "UI 대기 시간 표시",
    )
    assert(locked && !subject.disabled && editor.contentEditable === "true", "게시 UI 잠금 및 복원")
    assert(
      root.querySelector(".ruricon-upload-notice")?.textContent === "세트 게시가 완료되었습니다.",
      "동일 화면 완료 안내",
    )
    cleanup()
    assert(
      !registration.querySelector(".ruricon-bundle-submit") &&
        rawSubmit.innerHTML === "<span>등록</span>" &&
        rawSubmit.style.opacity === "0.8" &&
        rawSubmit.style.getPropertyPriority("opacity") === "important",
      "cleanup은 묶음 버튼 제거 및 원래 등록 표시 복원",
    )
    const originalPath = location.href
    try {
      history.replaceState(null, "", "/community/board/98/modify/2678")
      html = final
      subject.value = "냥냥콘 (M)"
      const modified = new IconSetController(subject)
      assert(modified.mainArticleId === 2678, "수정 URL에서 대표 ID 확보")
      history.replaceState(null, "", "/community/board/98/modify/10000")
      html = compileMain(body, { ...restored.state!, mainArticleId: 10000 })
      subject.value = "냥냥콘 (M)"
      const fiveDigit = new IconSetController(subject)
      assert(Number(subject.maxLength) === 35, "5자리 대표 수정 화면의 입력 제한")
      fiveDigit.selectPage(10)
      assert(Number(subject.maxLength) === 34, "5자리 ID와 2자리 index 입력 제한")
      html = final
      history.replaceState(null, "", "/community/board/98/modify/9999")
      subject.value = "냥냥콘 (M)"
      rejects(() => new IconSetController(subject), "수정 URL과 상태 ID 불일치 차단")
    } finally {
      history.replaceState(null, "", originalPath)
    }
    subject.value = "냥냥콘1 (S2678)"
    html = '<img src="https://example.invalid/a.gif">'
    const slaveCleanup = mountIconUpload()
    assert(
      board.querySelector<HTMLButtonElement>(".ruricon-publish")!.disabled &&
        board.querySelector<HTMLAnchorElement>(".ruricon-main-link")!.getAttribute("href") ===
          "/community/board/98/modify/2678",
      "분할 편집은 대표로 안내",
    )
    const submit = new Event("submit", { cancelable: true })
    form.dispatchEvent(submit)
    assert(!submit.defaultPrevented, "Raw 등록은 기존 submit 동작 유지")
    slaveCleanup()
    const article = createArticle({
      board_id: 98,
      category: 8,
      subject: "대기 테스트",
      content: body,
    })
    requests.length = 0
    const concurrentTime = now
    await Promise.all([
      writeArticle(article),
      writeArticle(article),
      writeArticle(article, { articleId: 2678 }),
    ])
    const creates = requests.filter((request) => request.path.endsWith("/write"))
    assert(
      creates.length === 2 && creates[1].time - creates[0].time === 35_000,
      "동시 신규 요청도 공통 생성 대기열에서 순서대로 실행",
    )
    assert(
      requests[0].path.endsWith("/modify/2678") && requests[0].time === concurrentTime,
      "수정은 생성 대기열을 기다리지 않음",
    )
    html = body
    subject.value = "냥냥콘"
    const uncertain = new IconSetController(subject)
    globalThis.fetch = async () => {
      throw new Error("connection lost")
    }
    try {
      await uncertain.publish(8)
    } catch {
      /* Expected uncertain write. */
    }
    let blocked = false
    try {
      await uncertain.publish(8)
    } catch (error) {
      blocked = String(error).includes("불명확")
    }
    assert(blocked, "응답 유실 시 맹목적 중복 게시 차단")
  } finally {
    globalThis.fetch = originalFetch
    Date.now = originalNow
    globalThis.setTimeout = originalTimeout
  }
  document.querySelector("#result")!.textContent =
    "PASS · 메타데이터·복원·재시도·35초 생성 간격·수정 대기 제외·카운트다운·게시 잠금"
}
void check().catch((error) => {
  document.querySelector("#result")!.textContent = `FAIL · ${String(error)}`
  console.error(error)
})
