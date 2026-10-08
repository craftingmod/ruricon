import { IconSetController, parseSetTitle } from "../entrypoints/lib/editor/IconSetController.ts"
import type { IconUploadRoot } from "../entrypoints/scripts/icon-upload.ts"
import { mountIconUpload } from "../entrypoints/scripts/icon-upload.ts"

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message)
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

async function check() {
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
    "PASS · Main Context 보관, Slave 별도 HTML, (M)/(S1234) 제목, 빈 제목 시작, 페이지 복원, 실패 보호"
}

void check().catch((error: unknown) => {
  document.querySelector("#result")!.textContent = `FAIL · ${String(error)}`
  console.error(error)
})
