import { mountIconUpload, parseSetTitle } from "../entrypoints/scripts/icon-upload.ts"

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message)
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

async function check() {
  assert(parseSetTitle("냥냥콘 #2")?.page === 2, "번호 파싱")
  assert(parseSetTitle("냥냥콘 #2 ")?.name === "냥냥콘", "세트 이름 파싱")
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
  assert(document.querySelectorAll(".ruricon-upload").length === 1, "중복 삽입 방지")
  assert(
    document.querySelector(".board_main_view")!.firstElementChild?.className === "ruricon-upload",
    "맨 위 삽입",
  )
  const count = () => document.querySelector(".ruricon-upload-count")!.textContent
  assert(count() === "0 / 100", "툴바와 오래된 textarea 이미지 제외")
  body.innerHTML = "<img>".repeat(101)
  await settle()
  assert(count() === "101 / 100", "iframe 이미지 추가 반영")
  assert(
    document.querySelector(".ruricon-upload-notice")!.textContent!.includes("1개 초과"),
    "초과 안내",
  )
  body.replaceChildren()
  await settle()
  assert(count() === "0 / 100", "마지막 이미지 삭제 반영")
  const editable = document.createElement("div")
  editable.contentEditable = "true"
  editable.innerHTML = "<img>".repeat(2)
  document.querySelector(".board_main_view")!.append(editable)
  frame.hidden = true
  body.innerHTML = "<img>".repeat(5)
  await settle()
  assert(count() === "2 / 100", "활성 편집기만 계산")
  editable.remove()
  frame.hidden = false
  body.replaceChildren()
  await settle()
  source.hidden = false
  source.value = "<img>".repeat(3)
  source.dispatchEvent(new Event("input", { bubbles: true }))
  await settle()
  assert(count() === "3 / 100", "HTML 모드 개수")
  source.hidden = true
  subject.value = "단일 제목"
  subject.dispatchEvent(new Event("input", { bubbles: true }))
  await settle()
  document.querySelector<HTMLButtonElement>(".ruricon-set-next")!.click()
  await settle()
  assert(subject.value === "단일 제목 #1", "세트 시작")
  document.querySelector<HTMLButtonElement>(".ruricon-set-next")!.click()
  await settle()
  assert(String(subject.value) === "단일 제목 #2", "다음 번호")
  subject.value = "가".repeat(45)
  subject.dispatchEvent(new Event("input", { bubbles: true }))
  await settle()
  document.querySelector<HTMLButtonElement>(".ruricon-set-next")!.click()
  assert(subject.value.length === 45, "제목 길이 제한")
  cleanup()
  assert(!document.querySelector(".ruricon-upload"), "정리")
  subject.value = "냥냥콘 #2"
  body.innerHTML = "<img>".repeat(87)
  mountIconUpload()
  document.querySelector("#result")!.textContent =
    "PASS · 제목 파싱, 상단 삽입, 중복 방지, iframe 개수 갱신, 삭제, HTML 모드, 번호 변경, 제목 길이 제한, 정리"
}

void check().catch((error: unknown) => {
  document.querySelector("#result")!.textContent = `FAIL · ${String(error)}`
  console.error(error)
})
