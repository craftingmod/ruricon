import { compileMain } from "../entrypoints/lib/editor/articleMeta.ts"
import { loadCollection, loadNativePage, loadPresets } from "../entrypoints/lib/icon-view.ts"
import { getLastId, readIconImages } from "../entrypoints/lib/ruli-utils.ts"
import { mountCommentIconHook } from "../entrypoints/scripts/comment-icon.ts"

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message)
}
const requests: string[] = []
const source = (id: number, index: number) => `https://example.com/${id}/${index}.png?icon=${id}`
let failSecondPage = true
let releaseSlow: (() => void) | null = null
const result = document.querySelector<HTMLElement>("#result")!
const originalFetch = window.fetch
let nativeCalls = 0
window.app = {
  select_icon(image) {
    const wrapper = image.closest(".common_write_wrapper")!
    wrapper.querySelector(".icon_preview")?.remove()
    const preview = document.createElement("img")
    preview.className = "icon_preview"
    preview.src = image.src
    wrapper.querySelector(".common_input_wrapper")!.before(preview)
  },
  comment_icon() {
    nativeCalls++
  },
  comment_icon_toggle() {
    nativeCalls++
  },
} as App
window.fetch = async (input, options) => {
  const url = new URL(
    input instanceof Request ? input.url : input instanceof URL ? input.href : input,
  )
  requests.push(url.href)
  if (url.hostname === "api.ruliweb.com") {
    assert(options?.credentials === "include", "API includes login cookies")
    const id = Number(url.searchParams.get("id"))
    if (!id) {
      const packs = [
        [1917, "AD1"],
        [3213, "AD2"],
        [900, "냥냥 (M)"],
        [901, "냥냥1 (S900)"],
        [5033, "Native"],
        [910, "분할만2 (S920)"],
        [940, "Slow"],
        [950, "Broken (M)"],
      ]
      return Response.json({
        success: true,
        html: `<div></div><div><div>${packs.map(([id, title]) => `<div><div class="icon_data_show_target" title="${title}" onclick="app.icon_data_show(this, ${id});"><img src="${source(Number(id), 0)}"></div></div>`).join("")}</div></div>`,
      })
    }
    const offset = Number(url.searchParams.get("offset"))
    assert(url.searchParams.get("limit") === "100", "Fetch unit is 100")
    if (id === 5033 && offset === 100 && failSecondPage) {
      failSecondPage = false
      return new Response("fail", { status: 503 })
    }
    if (id === 940)
      await new Promise<void>((resolve) => {
        releaseSlow = resolve
      })
    const total = id === 5033 ? 205 : 1
    const media = Array.from(
      { length: Math.min(100, total - offset) },
      (_, index) => `<img src="${source(id, offset + index)}">`,
    ).join("")
    const html = offset
      ? media
      : `<style>.native{}</style><div><a>Native</a><span onclick="app.comment_icon_pick_add(this, 'Native', ${id});"></span></div><div class="select_icon_box">${media}</div>`
    return Response.json({
      success: true,
      html,
      total_count: total,
      has_more: offset + 100 < total,
      next_offset: Math.min(offset + 100, total),
    })
  }
  const id = Number(url.pathname.split("/").at(-1))
  const content =
    id === 950
      ? "<p>Missing metadata</p>"
      : compileMain("<p>Main HTML is excluded</p>", {
          version: 1,
          name: id === 900 ? "냥냥" : "분할만",
          boardId: 98,
          mainArticleId: id,
          slaves: [
            { page: 3, articleId: id + 2, images: [source(id + 2, 0)] },
            {
              page: 1,
              articleId: id + 1,
              images: Array.from({ length: 96 }, (_, index) => source(id + 1, index)),
            },
          ],
        })
  return new Response(
    `<div class="board_main"><div class="board_main_view"><div class="view_content"><article><div>${content}</div></article></div></div></div>`,
  )
}
localStorage.removeItem("ruricon:icon-view:v1")
const cleanup = mountCommentIconHook()
const tick = async () => {
  for (let index = 0; index < 12; index++) await new Promise((resolve) => setTimeout(resolve, 0))
}
const click = (selector: string, parent: ParentNode = document) => {
  const element = parent.querySelector<HTMLElement>(selector)
  assert(element, `Missing ${selector}`)
  element.click()
  return element
}
async function choose(name: string, parent: ParentNode = document.querySelector("#comment")!) {
  click(".ruricon-preset-select", parent)
  const search = document.querySelector<HTMLInputElement>("dialog input")!
  search.value = name
  search.dispatchEvent(new Event("input"))
  click("dialog .ruricon-preset-list button")
  await tick()
}
async function check() {
  assert(getLastId("app.icon_data_show(this, 5033);") === 5033, "Numeric ID isn't truncated")
  assert(getLastId("app.icon_data_show(this, '5033');") === 5033, "Quoted ID")
  assert(getLastId("bad") === null, "Invalid ID")
  const comment = document.querySelector<HTMLElement>("#comment")!
  const selectIcon = window.app.select_icon
  delete (window.app as Partial<App>).select_icon
  click("button[onclick]", comment)
  assert(nativeCalls === 1, "Unavailable native adapter preserves inline fallback")
  window.app.select_icon = selectIcon
  nativeCalls = 0
  click("button[onclick]", comment)
  await tick()
  assert(nativeCalls === 0, "Capture stops native inline handlers")
  assert(
    comment.querySelectorAll(".ruricon-icon-grid img").length === 96,
    "One whole segment is rendered",
  )
  assert(
    comment.querySelector(".ruricon-preset-select")!.textContent!.includes("냥냥"),
    "Metadata set name",
  )
  const numbers = [...comment.querySelectorAll("nav button")].map((button) => button.textContent)
  assert(numbers.join(",") === "1,3", "Segment page numbers and order")
  assert(
    comment
      .querySelector(".ruricon-preset-select")!
      .compareDocumentPosition(comment.querySelector("nav")!) & Node.DOCUMENT_POSITION_FOLLOWING,
    "Page buttons follow preset selector",
  )
  assert(
    comment
      .querySelector("nav")!
      .compareDocumentPosition(comment.querySelector(".ruricon-icon-grid")!) &
      Node.DOCUMENT_POSITION_FOLLOWING,
    "Page buttons precede grid",
  )
  assert(requests.filter((url) => url.includes("/read/")).length === 1, "No eager N+1 reads")
  click("nav button:last-child", comment)
  assert(
    comment.querySelectorAll(".ruricon-icon-grid img").length === 1,
    "Segment changes by page button",
  )
  click(".ruricon-icon-insert", comment)
  await tick()
  assert(
    comment.querySelector<HTMLImageElement>(".icon_preview")?.src === source(902, 0),
    "Native preview receives unchanged URL",
  )
  click(".ruricon-icon-star", comment)
  click(".ruricon-icon-tabs button:nth-child(2)", comment)
  assert(comment.querySelectorAll(".ruricon-icon-grid img").length === 1, "Local favorites")
  click(".ruricon-icon-tabs button:nth-child(3)", comment)
  assert(
    comment.querySelectorAll(".ruricon-icon-grid img").length === 1,
    "Recent successful insertion",
  )
  assert(
    JSON.parse(localStorage.getItem("ruricon:icon-view:v1")!).recent[0] === source(902, 0),
    "Recent persisted",
  )
  await choose("Native")
  assert(
    comment.querySelectorAll(".ruricon-icon-grid img").length === 100,
    "Native fetch page renders 100",
  )
  const scrollingGrid = comment.querySelector<HTMLElement>(".ruricon-icon-grid")!
  assert(scrollingGrid.scrollHeight > scrollingGrid.clientHeight, "Full page scrolls vertically")
  assert(comment.querySelectorAll("nav button").length === 3, "Native page count")
  click("nav button:nth-child(2)", comment)
  await tick()
  assert(comment.querySelector('[role="status"]')!.textContent!.includes("503"), "Failure visible")
  const retry = [...comment.querySelectorAll<HTMLButtonElement>("button")].find(
    (button) => button.textContent === "다시 시도",
  )!
  retry.click()
  await tick()
  assert(
    comment.querySelectorAll(".ruricon-icon-grid img").length === 100,
    "Retry loads offset page without header",
  )
  assert(
    comment.querySelector<HTMLImageElement>(".ruricon-icon-grid img")!.src === source(5033, 100),
    "Offset page preserves URLs",
  )
  click("nav button:last-child", comment)
  await tick()
  assert(comment.querySelectorAll(".ruricon-icon-grid img").length === 5, "Last partial fetch page")
  click("nav button:first-child", comment)
  assert(comment.querySelectorAll(".ruricon-icon-grid img").length === 100, "Back to cached page")
  await choose("분할만")
  assert(
    requests.some((url) => url.endsWith("/read/920")),
    "S-only favorite resolves Main",
  )
  assert(!requests.some((url) => url.endsWith("/read/910")), "No Slave article fetch")
  await choose("Broken")
  assert(
    comment.querySelector('[role="status"]')!.textContent!.includes("metadata"),
    "Missing metadata doesn't fall back to Main images",
  )
  await choose("Slow")
  await choose("Native")
  assert(releaseSlow, "Slow request pending")
  releaseSlow()
  await tick()
  assert(
    comment.querySelector(".ruricon-preset-select")!.textContent!.includes("Native"),
    "Stale request cannot overwrite selection",
  )
  const reply = document.querySelector("#reply")!
  click("button[onclick]", reply)
  await tick()
  const mobileGrid = reply.querySelector<HTMLElement>(".ruricon-icon-grid")!
  assert(mobileGrid.scrollWidth <= mobileGrid.clientWidth, "Narrow reply grid fits horizontally")
  click(".ruricon-preset-select", reply)
  const modal = document.querySelector<HTMLDialogElement>("dialog")!
  assert(modal.open, "Native dialog opens")
  assert(document.activeElement === modal.querySelector("input"), "Search receives focus")
  modal.close()
  await tick()
  assert(
    document.activeElement === reply.querySelector(".ruricon-preset-select"),
    "Close restores focus",
  )
  click(".ruricon-icon-insert", reply)
  await tick()
  assert(reply.querySelector(".icon_preview"), "Reply wrapper owns preview")
  click("button[onclick]", reply)
  assert(reply.querySelector<HTMLElement>(".comment_icon")!.hidden, "Toggle closes panel")
  click("button[onclick]", reply)
  assert(!reply.querySelector<HTMLElement>(".comment_icon")!.hidden, "Toggle reopens panel")
  assert(document.querySelectorAll("dialog").length === 1, "Shared single dialog")
  const presets = await loadPresets()
  assert(presets.length === 5, "M/S favorites collapse into one preset; ads excluded")
  assert(!presets.some((preset) => preset.id === 901), "Slave doesn't duplicate Main")
  const before = requests.length
  await Promise.all([loadCollection(presets[0]), loadCollection(presets[0])])
  assert(requests.length === before, "Shared cached requests")
  const beforeNewPage = requests.length
  await Promise.all([loadNativePage(960, 0), loadNativePage(960, 0)])
  assert(requests.length === beforeNewPage + 1, "Concurrent requests share one fetch")
  await loadNativePage(5033, 200)
  await readIconImages(5033, 200)
  cleanup()
  assert(!document.querySelector(".ruricon-icon-view, dialog"), "Unmount cleans views and dialog")
  click("button[onclick]", reply)
  assert(Number(nativeCalls) === 1, "Cleanup restores native button")
  result.textContent =
    "PASS: API parsing, segment/native pages, URL preservation, favorites/recent, retry, races, comment/reply ownership and cleanup"
  result.dataset.result = "PASS"
}
void check()
  .catch((error) => {
    result.textContent = `FAIL: ${error instanceof Error ? error.stack : error}`
    result.dataset.result = "FAIL"
  })
  .finally(() => {
    window.fetch = originalFetch
  })
