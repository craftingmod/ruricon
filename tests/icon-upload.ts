import { splitNum } from "@/entrypoints/lib/constants.ts";
import { IconSetController, parseSetTitle } from "../entrypoints/lib/editor/IconSetController.ts"
import {
  countImages,
  organizeImages,
  splitImages,
} from "../entrypoints/lib/editor/organizeImages.ts"
import type { IconUploadRoot } from "../entrypoints/scripts/icon-upload.ts"
import { mountIconUpload } from "../entrypoints/scripts/icon-upload.ts"

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message)
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

async function check() {
  const iconHtml = (size: number) =>
    Array.from(
      { length: size },
      (_, index) =>
        `<img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7#${index}">`,
    ).join("")
  assert(splitImages(iconHtml(100)) === null, "100개는 분할하지 않음")
  const gifVideo = `<video src="https://example.invalid/a.mp4?gif" loop muted style="width: 200px" alt="원래 alt"></video>`
  const plainVideo = `<video src="https://example.invalid/movie.mp4" controls></video>`
  const mixedVideos =
    gifVideo +
    iconHtml(99) +
    `<video src="https://example.invalid/b.mp4?gif#preview"></video>` +
    plainVideo
  assert(countImages(mixedVideos) === 101, "mp4?gif만 업로드 개수에 포함")
  assert(
    countImages(
      `<video src="movie.mp4"></video><video src="movie.mp4?gif=false"></video><video src="movie.mp4?gift"></video>`,
    ) === 0,
    "일반 mp4와 다른 쿼리 제외",
  )
  const organizedVideos = new DOMParser().parseFromString(organizeImages(mixedVideos), "text/html")
  assert(
    organizedVideos.querySelectorAll("video").length === 1 &&
      organizedVideos.querySelector("video")!.getAttribute("src") ===
        "https://example.invalid/movie.mp4",
    "일반 mp4 보존",
  )
  const convertedImages = [...organizedVideos.querySelectorAll("img")]
  assert(
    convertedImages[0].getAttribute("src") === "https://example.invalid/a.gif" &&
      convertedImages[100].getAttribute("src") === "https://example.invalid/b.gif#preview",
    "gif 경로 치환 및 순서 유지",
  )
  assert(
    convertedImages[0].attributes.length === 2 && convertedImages[0].alt === "0",
    "video 속성을 복사하지 않고 grid 순번 사용",
  )
  const splitVideos = splitImages(mixedVideos)!
  assert(
    splitVideos.pages.length === 2 &&
    countImages(splitVideos.pages[0]) === splitNum &&
      countImages(splitVideos.pages[1]) === 11,
    `video 치환 후 ${splitNum}개 분할`,
  )
  assert(
    splitVideos.mainHtml.includes("movie.mp4") && !splitVideos.mainHtml.includes("?gif"),
    "일반 mp4는 Main에 보관",
  )
  for (const size of [101, 180, 181, 1454]) {
    const split = splitImages(`<p>세트 설명</p><p><br></p>${iconHtml(size)}`)!
    assert(split.mainHtml === "<p>세트 설명</p>", "이미지 외 본문은 Main에 보관")
    assert(split.pages.length === Math.ceil(size / 90), "90개씩 페이지 생성")
    const images = split.pages.flatMap((html, page) => {
      const doc = new DOMParser().parseFromString(html, "text/html")
      const icons = [...doc.querySelectorAll("img")]
      assert(icons.length === Math.min(90, size - page * 90), "각 페이지 90개 이하")
      assert(
        doc.body.children.length === 1 &&
          doc.body.firstElementChild!.getAttribute("style")!.includes("repeat(8, 1fr)"),
        "분할 후 grid 정리",
      )
      assert(
        icons.every((image, index) => image.alt === String(index)),
        "각 페이지의 alt 순번",
      )
      return icons.map((image) => image.getAttribute("src"))
    })
    assert(
      images.every((src, index) => src!.endsWith(`#${index}`)),
      "분할 중 이미지 순서와 수량 유지",
    )
  }
  const mixedHtml = `<p>앞부분<img title="x > y" src='a?x=1&amp;y=2' style="width: 50px">뒷부분</p><p><img src="b"></p><img SRC="b"><img alt="src 없음"><p>마지막 글</p>`
  const organized = organizeImages(mixedHtml)
  const organizedDoc = new DOMParser().parseFromString(organized, "text/html")
  const grid = organizedDoc.body.lastElementChild!
  assert(grid.tagName === "P" && grid.getAttribute("style")!.includes("repeat(8, 1fr)"), "8열 grid")
  const gridImages = [...grid.querySelectorAll("img")]
  assert(
    gridImages.map((image) => image.getAttribute("src")).join("|") === "a?x=1&y=2|b|b",
    "src 추출 순서 및 중복 유지",
  )
  assert(
    gridImages.every(
      (image, index) => image.alt === String(index) && image.attributes.length === 2,
    ),
    "src와 alt index만 생성",
  )
  assert(
    organizedDoc.body.textContent!.includes("앞부분뒷부분") &&
      organizedDoc.body.textContent!.includes("마지막 글"),
    "혼합 문단 텍스트 보존",
  )
  assert(organizedDoc.querySelector("img:not([src])"), "src 없는 이미지 보존")
  assert(organizeImages(organized) === organized, "반복 정리 시 grid 중복 방지")
  assert(organizeImages("<p>이미지 없음</p>") === "<p>이미지 없음</p>", "이미지 없으면 변경 없음")
  const blanks = `<p><br></p>\n<p style="text-align: center;"><br></p>\n<p style="text-align: center;"><br></p>\n<p><br></p>`
  assert(organizeImages(blanks) === "", "이미지 없이 공백 문단 trim")
  assert(
    organizeImages(`<p>&nbsp; <br><br></p><p>본문<br></p>`) === "<p>본문<br></p>",
    "공백 문단만 제거하고 본문 줄바꿈 유지",
  )
  const trimmedGrid = organizeImages(`${blanks}<p><br><img src="icon"><br></p>${blanks}`)
  const trimmedDoc = new DOMParser().parseFromString(trimmedGrid, "text/html")
  assert(
    trimmedDoc.body.children.length === 1 &&
      trimmedDoc.body.querySelector("img")?.getAttribute("src") === "icon",
    "이미지 주변 공백 문단 제거",
  )
  assert(parseSetTitle("냥냥콘 #2")?.page === 2, "번호 파싱")
  assert(parseSetTitle("냥냥콘 (M)")?.page === 0, "Main 표기 파싱")
  assert(parseSetTitle("냥냥콘 #2 (S1234)")?.slaveId === "1234", "36진수 Slave 표기 파싱")
  for (const title of [
    "기존 제목",
    "#2",
    "냥냥콘 #0",
    "냥냥콘 #2 뒤",
    "냥냥콘 #9007199254740992",
  ]) {
    assert(parseSetTitle(title) === null, `잘못된 번호: ${title}`)
  }
  const frame = document.querySelector("iframe")!
  if (frame.contentDocument?.readyState !== "complete") {
    await new Promise((resolve) => frame.addEventListener("load", resolve, { once: true }))
  }
  const body = frame.contentDocument!.body
  const subject = document.querySelector<HTMLInputElement>('input[name="subject"]')!
  const source = document.querySelector<HTMLTextAreaElement>("textarea")!
  const cleanup = mountIconUpload()
  mountIconUpload()
  const root = document.querySelector<IconUploadRoot>(".ruricon-upload")!
  assert(document.querySelectorAll(".ruricon-upload").length === 1, "중복 삽입 방지")
  assert(document.querySelector(".board_main_view")!.firstElementChild === root, "맨 위 삽입")
  assert(!root.controller, "seditor 준비 전 대기")
  let failRead = false
  let failWrite = false
  globalThis.seditor = {
    ref: body,
    getHtml() {
      if (failRead) throw new Error("읽기 실패")
      return source.hidden ? body.innerHTML : source.value
    },
    setHtml(html) {
      if (failWrite) {
        body.innerHTML = "<p>부분 쓰기 실패</p>"
        throw new Error("쓰기 실패")
      }
      body.innerHTML = html
      source.value = html
    },
  }
  body.innerHTML = "<p>첫 번째 본문</p>" + "<img>".repeat(101)
  await settle()
  const controller = root.controller!
  assert(controller && controller.activePage === 2, "root controller 생성")
  const count = () => root.querySelector(".ruricon-upload-count")!.textContent
  const next = root.querySelector<HTMLButtonElement>(".ruricon-set-next")!
  assert(count() === "101 / 100", "seditor 본문 개수")
  assert(
    root.querySelector(".ruricon-upload-notice")!.textContent!.includes("1개 초과"),
    "초과 안내",
  )
  const firstHtml = seditor.getHtml()
  next.click()
  await settle()
  assert(controller.pages.get(2) === firstHtml, "전환 전 HTML 보관")
  assert(subject.value === "냥냥콘 #3" && seditor.getHtml() === "", "빈 새 페이지")
  body.innerHTML = "<p>두 번째 본문</p><img><img>"
  await settle()
  const secondHtml = seditor.getHtml()
  root.querySelector<HTMLButtonElement>('[data-page="2"]')!.click()
  await settle()
  assert(seditor.getHtml() === firstHtml && count() === "101 / 100", "이전 페이지 복원")
  assert(controller.pages.get(3) === secondHtml, "별도 HTML 보관")
  assert(root.querySelector<HTMLButtonElement>(".ruricon-organize"), "정리 버튼")
  body.innerHTML = mixedHtml
  root.querySelector<HTMLButtonElement>(".ruricon-organize")!.click()
  await settle()
  assert(
    seditor.getHtml() === organized && controller.pages.get(2) === organized,
    "정리 버튼으로 현재 페이지 저장",
  )
  assert(controller.pages.get(3) === secondHtml, "다른 페이지는 변경 없음")
  assert(
    root.querySelector(".ruricon-upload-notice")!.textContent === "",
    "일반 업로드 정책 문구 제거",
  )
  subject.value = "냥냥콘 #3"
  subject.dispatchEvent(new Event("change", { bubbles: true }))
  await settle()
  assert(seditor.getHtml() === secondHtml && count() === "2 / 100", "제목 번호로 전환")
  source.hidden = false
  source.value = "<p>HTML 모드 수정</p><img>"
  source.dispatchEvent(new Event("input", { bubbles: true }))
  await settle()
  assert(count() === "1 / 100", "seditor HTML 모드")
  const sourceHtml = source.value
  controller.selectPage(2)
  controller.selectPage(3)
  await settle()
  assert(seditor.getHtml() === sourceHtml, "HTML 모드 수정 복원")
  source.hidden = true
  failWrite = true
  root.querySelector<HTMLButtonElement>('[data-page="2"]')!.click()
  await settle()
  assert(
    controller.activePage === 3 && controller.pages.get(3) === sourceHtml,
    "쓰기 실패 시 원본 보관",
  )
  failWrite = false
  controller.selectPage(3)
  await settle()
  assert(seditor.getHtml() === sourceHtml, "복원 실패 후 저장된 HTML로 복구")
  failRead = true
  root.querySelector<HTMLButtonElement>('[data-page="2"]')!.click()
  assert(controller.pages.size === 2 && controller.activePage === 3, "읽기 실패 시 추가 중단")
  failRead = false
  subject.value = "가".repeat(45)
  subject.dispatchEvent(new Event("input", { bubbles: true }))
  await settle()
  next.click()
  assert(subject.value.length === 45 && controller.pages.size === 2, "제목 길이 제한")
  cleanup()
  assert(!document.querySelector(".ruricon-upload"), "정리")
  subject.value = "분할 테스트"
  const splitOriginal = `<p>세트 설명</p>${iconHtml(181)}`
  seditor.setHtml(splitOriginal)
  const splitCleanup = mountIconUpload()
  const splitRoot = document.querySelector<IconUploadRoot>(".ruricon-upload")!
  const splitButton = splitRoot.querySelector<HTMLButtonElement>(".ruricon-split")!
  const splitController = splitRoot.controller!
  assert(!splitButton.hidden && !splitButton.disabled, "단일 페이지 초과 시 분할 표시")
  failWrite = true
  splitButton.click()
  await settle()
  assert(
    !splitController.isSet &&
      splitController.pages.size === 0 &&
      splitController.main!.html === splitOriginal,
    "분할 쓰기 실패 시 원본 및 페이지 상태 보존",
  )
  failWrite = false
  splitController.selectPage(0)
  splitCleanup()
  subject.value = "분할 테스트"
  seditor.setHtml(splitOriginal)
  const retryCleanup = mountIconUpload()
  const retryRoot = document.querySelector<IconUploadRoot>(".ruricon-upload")!
  retryRoot.querySelector<HTMLButtonElement>(".ruricon-split")!.click()
  await settle()
  const retry = retryRoot.controller!
  assert(
    retry.isSet && retry.activePage === 1 && retry.pages.size === 3,
    "분할 후 세트 및 첫 Slave 활성화",
  )
  assert(
    retry.main!.html === "<p>세트 설명</p>" && String(subject.value) === "분할 테스트 #1",
    "Main 보관 및 제목 전환",
  )
  assert(
    retryRoot.querySelector<HTMLButtonElement>(".ruricon-split")!.hidden,
    "세트 구성 후 분할 숨김",
  )
  const firstSplitPage = retry.pages.get(1)
  retry.splitImages()
  assert(
    retry.pages.get(1) === firstSplitPage && retry.pages.size === 3,
    "기존 세트 중복 분할 방지",
  )
  retry.selectPage(3)
  await settle()
  assert(
    new DOMParser().parseFromString(seditor.getHtml(), "text/html").querySelectorAll("img")
      .length === 1,
    "마지막 분할 페이지 복원",
  )
  retryCleanup()
  subject.value = "GIF 영상 분할"
  seditor.setHtml(mixedVideos)
  const videoCleanup = mountIconUpload()
  const videoRoot = document.querySelector<IconUploadRoot>(".ruricon-upload")!
  assert(
    videoRoot.querySelector(".ruricon-upload-count")!.textContent === "101 / 100",
    "영상 포함 quota 표시",
  )
  const videoSplit = videoRoot.querySelector<HTMLButtonElement>(".ruricon-split")!
  assert(!videoSplit.hidden, "GIF 영상으로 100개 초과 시 분할 활성화")
  videoSplit.click()
  await settle()
  assert(
    videoRoot.controller!.pages.size === 2 &&
      videoRoot.querySelector(".ruricon-upload-count")!.textContent === "90 / 100",
    "GIF 영상 포함 실제 버튼 분할",
  )
  assert(
    videoRoot.controller!.main!.html.includes("movie.mp4"),
    "버튼 분할 시 일반 영상은 Main에 보관",
  )
  videoCleanup()
  subject.value = ""
  const draft = "<p>제목 없는 본문</p><img>"
  seditor.setHtml(draft)
  const blankCleanup = mountIconUpload()
  const blankRoot = document.querySelector<IconUploadRoot>(".ruricon-upload")!
  const blankNext = blankRoot.querySelector<HTMLButtonElement>(".ruricon-set-next")!
  assert(!blankNext.disabled, "빈 제목에서도 #1 시작 활성화")
  blankNext.click()
  await settle()
  assert(blankRoot.controller!.isSet && seditor.getHtml() === "", "세트 시작 시 빈 #1 Slave")
  assert(blankRoot.controller!.main?.html === draft, "현 Context는 Main으로 보관")
  assert(
    blankRoot.controller!.main?.slaves === blankRoot.controller!.pages,
    "Main이 Slave 정보 참조",
  )
  body.innerHTML = "<p>첫 Slave 본문</p>"
  await settle()
  const slaveHtml = seditor.getHtml()
  blankNext.click()
  await settle()
  assert(
    blankRoot.controller!.pages.get(1) === slaveHtml && seditor.getHtml() === "",
    "빈 제목으로 다음 페이지 추가",
  )
  subject.value = "새 제목"
  subject.dispatchEvent(new Event("change", { bubbles: true }))
  await settle()
  assert(String(subject.value) === "새 제목 #2", "나중에 입력한 제목에 활성 번호 적용")
  blankRoot.querySelector<HTMLButtonElement>('[data-page="0"]')!.click()
  await settle()
  assert(
    seditor.getHtml() === draft && String(subject.value) === "새 제목 (M)",
    "Main 본문 및 제목 복원",
  )
  blankRoot.querySelector<HTMLButtonElement>('[data-page="1"]')!.click()
  await settle()
  assert(
    seditor.getHtml() === slaveHtml && String(subject.value) === "새 제목 #1",
    "첫 Slave 별도 복원",
  )
  subject.value = "새 제목 #1 (S1234)"
  subject.dispatchEvent(new Event("change", { bubbles: true }))
  await settle()
  blankRoot.controller!.selectPage(0)
  assert(String(subject.value) === "새 제목 (M)", "Main은 Slave ID 대신 (M) 표기")
  blankRoot.controller!.selectPage(1)
  await settle()
  assert(String(subject.value) === "새 제목 #1 (S1234)", "Main 왕복 후 Slave ID 유지")
  blankCleanup()
  subject.value = "기존 세트 (M)"
  seditor.setHtml(draft)
  const resumed = new IconSetController(subject)
  assert(resumed.activePage === 0 && resumed.main?.html === draft, "기존 Main 제목으로 초기화")
  subject.value = "냥냥콘"
  seditor.setHtml("<p>Main 세트 설명</p>")
  mountIconUpload()
  const preview = document.querySelector<IconUploadRoot>(".ruricon-upload")!.controller!
  preview.addPage()
  seditor.setHtml("<p>1페이지</p>" + "<img>".repeat(100))
  preview.addPage()
  seditor.setHtml("<p>2페이지</p>" + "<img>".repeat(87))
  await settle()
  document.querySelector("#result")!.textContent =
    "PASS · mp4?gif 치환, 일반 mp4 보존, 영상 포함 quota·분할, 90개 분할, grid 정리, 실패 보호"
}

void check().catch((error: unknown) => {
  document.querySelector("#result")!.textContent = `FAIL · ${String(error)}`
  console.error(error)
})
