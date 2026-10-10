import { act } from "preact/test-utils"

import { compileMain } from "../entrypoints/lib/editor/articleMeta.ts"
import {
  getCachedImageCount,
  loadCollection,
  loadNativePage,
  loadPresets,
  removePresetFavorites,
} from "../entrypoints/lib/icon-view.ts"
import { getLastId, readIconImages } from "../entrypoints/lib/ruli-utils.ts"
import { mountCommentIconHook } from "../entrypoints/scripts/comment-icon.tsx"

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message)
}
const requests: string[] = []
const iconSize = location.hostname === "m.ruliweb.com" ? 70 : 100
const source = (id: number, index: number) =>
  `https://example.com/${id}/${index}.${id === 5033 && index === 1 ? "mp4" : "png"}?icon=${id}`
const nativeSource = (id: number, index: number) => source(id, index).split("?")[0]
let failSecondPage = true
let releaseSlow: (() => void) | null = null
let releaseInsert: (() => void) | null = null
let storageCount = 48
let storageSuccess = true
let storageStatus = 200
let holdStorage = false
let releaseStorage: (() => void) | null = null
const removedNativeFavorites = new Set<number>()
const removalCalls: number[] = []
let failRemovalId: number | null = 5033
let releaseRemoval: (() => void) | null = null
let holdRemoval = false
const result = document.querySelector<HTMLElement>("#result")!
const originalFetch = window.fetch
const originalConfirm = window.confirm
let confirmDeletion = true
const deletionPrompts: string[] = []
window.confirm = (message) => {
  deletionPrompts.push(String(message))
  return confirmDeletion
}
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
    if (url.searchParams.get("type") === "preset") {
      if (holdStorage)
        await new Promise<void>((resolve) => {
          releaseStorage = resolve
        })
      if (storageStatus !== 200) return new Response("fail", { status: storageStatus })
      return Response.json({
        success: storageSuccess,
        html: `<div>Storage</div><div><div>${Array.from({ length: storageCount }, (_, index) => `<img src="${source(999, index)}">`).join("")}</div></div>`,
      })
    }
    if (url.pathname === "/comment_icon_pick_remove") {
      assert(options?.method?.toLowerCase() === "post", "Removal uses POST")
      assert(options.body instanceof URLSearchParams, "Removal sends a form body")
      const id = Number(options.body.get("num"))
      removalCalls.push(id)
      if (holdRemoval)
        await new Promise<void>((resolve) => {
          releaseRemoval = resolve
        })
      if (id === failRemovalId) return Response.json({ success: false })
      removedNativeFavorites.add(id)
      return Response.json({ success: true })
    }
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
      ].filter(([id]) => !removedNativeFavorites.has(Number(id)))
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
    const total = id === 5033 || id === 970 ? 205 : 1
    const media =
      id === 970
        ? [
            `${nativeSource(id, offset)}?icon=1234`,
            `${nativeSource(id, offset)}?icon=5678`,
            `${nativeSource(id, offset + 1)}?size=large&icon=1234#preview`,
          ]
            .map((src) => `<img src="${src}">`)
            .join("")
        : Array.from(
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
          slaves:
            id === 980
              ? [
                  {
                    page: 3,
                    articleId: 982,
                    images: [
                      "https://example.com/shared.png",
                      "https://example.com/shared.png?icon=123",
                    ],
                  },
                  { page: 2, articleId: null, images: [source(980, 0)] },
                  {
                    page: 1,
                    articleId: 981,
                    images: [
                      "https://example.com/shared.png?icon=123",
                      "https://example.com/shared.png?icon=456&icon=789",
                      "https://example.com/other.png?size=large&icon=123#preview",
                    ],
                  },
                ]
              : [
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
localStorage.removeItem("ruricon:preset-favorites:v1")
localStorage.removeItem("ruricon:hidden-ad-presets:v1")
const cleanup = mountCommentIconHook()
const tick = async () => {
  for (let index = 0; index < 12; index++) await new Promise((resolve) => setTimeout(resolve, 0))
}
const waitFor = async (predicate: () => boolean) => {
  for (let attempt = 0; attempt < 100 && !predicate(); attempt++)
    await new Promise((resolve) => setTimeout(resolve, 10))
  assert(predicate(), "Layout update completed")
}
const click = (selector: string, parent: ParentNode = document) => {
  const element = parent.querySelector<HTMLElement>(selector)
  assert(element, `Missing ${selector}`)
  void act(() => element.click())
  return element
}
async function choose(name: string, parent: ParentNode = document.querySelector("#comment")!) {
  click(".ruricon-preset-select", parent)
  const search = document.querySelector<HTMLInputElement>("dialog input")!
  search.value = name
  void act(() => {
    search.dispatchEvent(new Event("input"))
  })
  click("dialog .ruricon-preset-option")
  click("dialog .ruricon-preset-apply")
  await tick()
}
function enableEditMode(parent: ParentNode) {
  click(".ruricon-icon-tabs button:nth-child(2)", parent)
  if (parent.querySelector(".ruricon-icon-edit-mode")!.getAttribute("aria-pressed") !== "true")
    click(".ruricon-icon-edit-mode", parent)
  click(".ruricon-icon-tabs button:first-child", parent)
}
async function checkPresetDialog(comment: HTMLElement) {
  const presets = await loadPresets()
  const native = presets.find((preset) => preset.id === 5033)!
  const master = presets.find((preset) => preset.id === 920)!
  const uncached = presets.find((preset) => preset.id === 940)!
  await loadNativePage(native.id, 0)
  await loadCollection(master)
  const beforeCachedCounts = requests.length
  assert(
    getCachedImageCount(native) === 205 && getCachedImageCount(master) === 97,
    "Counts are available from native page and Master collection caches",
  )
  assert(getCachedImageCount(uncached) === undefined, "Missing cache has no count")
  const originalNow = Date.now
  try {
    Date.now = () => originalNow() + 60_001
    assert(
      getCachedImageCount(native) === undefined && getCachedImageCount(master) === undefined,
      "Expired caches do not provide counts",
    )
  } finally {
    Date.now = originalNow
  }
  click(".ruricon-preset-select", comment)
  const modal = document.querySelector<HTMLDialogElement>("dialog")!
  assert(
    modal.querySelector(".ruricon-preset-heading strong")!.textContent === "프리셋 선택" &&
      modal.getAttribute("aria-labelledby") === "ruricon-preset-title",
    "Dialog restores the title and accessible heading",
  )
  const detail = modal.querySelector<HTMLElement>(".ruricon-preset-detail")!
  const sidebar = modal.querySelector<HTMLElement>(".ruricon-preset-sidebar")!
  const previewToggle = modal.querySelector<HTMLButtonElement>(".ruricon-preset-preview-toggle")!
  const vertical = getComputedStyle(previewToggle).display !== "none"
  const body = modal.querySelector<HTMLElement>(".ruricon-preset-body")!
  const footer = modal.querySelector<HTMLElement>(".ruricon-preset-footer")!
  if (!vertical) {
    const columns = getComputedStyle(body).gridTemplateColumns.split(" ").map(parseFloat)
    assert(
      columns.length === 2 && columns[0] >= 340 && columns[0] <= 420,
      "Wide layout constrains the list to 340–420px",
    )
    assert(
      Math.abs(columns[1] - (body.clientWidth - columns[0] - 28)) <= 1,
      "Preview occupies the remaining grid width",
    )
  }
  assert(
    [...modal.querySelectorAll(".ruricon-preset-footer button")]
      .filter((button) => getComputedStyle(button).display !== "none")
      .map((button) =>
        [...button.childNodes]
          .filter(
            (child) =>
              !(child instanceof HTMLElement) || getComputedStyle(child).display !== "none",
          )
          .map((child) => child.textContent)
          .join("")
          .trim(),
      )
      .join(",") === (vertical ? "삭제,미리보기,적용" : "삭제,취소,적용") &&
      !modal.textContent!.includes("선택한 프리셋의 아이콘을 표시합니다."),
    "CSS selects Preview/Apply for vertical layout and Cancel/Apply for wide layout",
  )
  assert(
    getComputedStyle(detail).visibility === (vertical ? "hidden" : "visible"),
    "Only vertical layout hides the initial preview",
  )
  if (vertical) {
    click(".ruricon-preset-preview-toggle", modal)
    assert(
      getComputedStyle(detail).visibility === "visible" &&
        getComputedStyle(sidebar).visibility === "hidden" &&
        previewToggle.getAttribute("aria-expanded") === "true",
      "Preview button shows detail and hides the list through CSS",
    )
    assert(
      modal.querySelector(".ruricon-preset-detail") === detail &&
        modal.querySelector(".ruricon-preset-sidebar") === sidebar,
      "Preview toggle retains both DOM sections",
    )
    click(".ruricon-preset-preview-toggle", modal)
    assert(
      getComputedStyle(detail).visibility === "hidden" &&
        getComputedStyle(sidebar).visibility === "visible",
      "List button returns to the existing sidebar",
    )
  }
  const countFor = (title: string) =>
    [...modal.querySelectorAll<HTMLElement>(".ruricon-preset-row")]
      .find((row) => row.querySelector(".ruricon-preset-title")!.textContent!.includes(title))!
      .querySelector(".ruricon-preset-count")!.textContent
  assert(
    countFor("Native") === "205개" && countFor("분할만") === "97개",
    "Unselected cards display existing cached counts without clicking",
  )
  assert(countFor("Slow") === "", "Uncached cards leave the count blank")
  await tick()
  assert(
    requests.length === beforeCachedCounts,
    "Reading cached card counts makes no extra requests",
  )
  const hangulSearch = modal.querySelector<HTMLInputElement>("input")!
  const presetList = modal.querySelector<HTMLElement>(".ruricon-preset-list")!
  const listHeight = presetList.getBoundingClientRect().height
  assert(
    listHeight > 0 &&
      presetList.getBoundingClientRect().bottom <= sidebar.getBoundingClientRect().bottom + 1,
    "List fills the remaining fixed sidebar height without overflowing",
  )
  hangulSearch.value = "냥냥"
  void act(() => {
    hangulSearch.dispatchEvent(new Event("input"))
  })
  assert(
    presetList.getBoundingClientRect().height === listHeight,
    "Filtering to one card preserves list height",
  )
  click(".ruricon-preset-option", modal)
  await waitFor(() => modal.querySelectorAll(".ruricon-preset-preview-grid img").length === 50)
  assert(
    [...modal.querySelectorAll<HTMLImageElement>(".ruricon-preset-preview-grid img")].every(
      (image, index) => image.src === source(901, index),
    ),
    "Master preview uses only Segment 1's first 50 icons",
  )
  const titleLink = modal.querySelector<HTMLAnchorElement>(".ruricon-preset-detail h2 a")!
  assert(
    titleLink.href.endsWith("/community/board/98/read/900") && titleLink.target === "_blank",
    "Title links to the actual preset article",
  )
  assert(!modal.textContent!.includes("아이콘 편집"), "Preset dialog has no icon editing action")
  assert(modal.getBoundingClientRect().width <= innerWidth, "Dialog fits the viewport")
  assert(!modal.querySelector(".ruricon-preset-list a"), "List titles are plain text")
  assert(modal.getBoundingClientRect().width <= 1600, "Dialog width is capped at 1600px")
  if (innerWidth > 1624)
    assert(
      modal.getBoundingClientRect().width === 1600,
      "Wide viewport uses the 1600px dialog width",
    )
  const thumbnail = modal.querySelector<HTMLImageElement>(".ruricon-preset-option img")!
  const previewIcon = modal.querySelector<HTMLImageElement>(".ruricon-preset-preview-grid img")!
  const thumbnailWidth = thumbnail.getBoundingClientRect().width
  if (vertical) click(".ruricon-preset-preview-toggle", modal)
  const previewGrid = modal.querySelector<HTMLElement>(".ruricon-preset-preview-grid")!
  const previewHeight = previewGrid.getBoundingClientRect().height
  assert(
    detail.getBoundingClientRect().height ===
      modal.querySelector(".ruricon-preset-body")!.getBoundingClientRect().height,
    "Detail matches the fixed body height",
  )
  assert(
    previewHeight > 0 &&
      Math.abs(
        previewGrid.getBoundingClientRect().bottom - detail.getBoundingClientRect().bottom,
      ) <= 1,
    "Preview grid fills the remaining detail height",
  )
  assert(
    getComputedStyle(previewGrid).overflowY === "auto",
    "Preview grid owns its vertical scroll area",
  )
  assert(
    body.getBoundingClientRect().bottom <= footer.getBoundingClientRect().top &&
      footer.getBoundingClientRect().bottom <= modal.getBoundingClientRect().bottom,
    "Fixed footer stays below both scroll panels and inside the dialog",
  )
  const originalHeight = modal.style.height
  modal.style.height = "300px"
  assert(
    body.clientHeight > 0 &&
      body.getBoundingClientRect().bottom <= footer.getBoundingClientRect().top &&
      footer.getBoundingClientRect().bottom <= modal.getBoundingClientRect().bottom,
    "Short dialog shrinks the panels without overlapping the footer",
  )
  modal.style.height = originalHeight
  assert(
    previewIcon.getBoundingClientRect().width >= iconSize,
    "Preview icons use the existing icon size",
  )
  assert(
    thumbnailWidth === iconSize * 0.8,
    "Card thumbnails use the existing shortcut preview size",
  )
  if (vertical) click(".ruricon-preset-preview-toggle", modal)
  modal.style.setProperty("--ruricon-icon-size", "120px")
  modal.style.setProperty("--ruricon-preset-shortcut-size", "60px")
  const resizedThumbnailWidth = thumbnail.getBoundingClientRect().width
  if (vertical) click(".ruricon-preset-preview-toggle", modal)
  assert(
    previewIcon.getBoundingClientRect().width >= 120 && resizedThumbnailWidth === 60,
    "Both existing CSS size variables control the dialog",
  )
  assert(
    previewGrid.scrollHeight > previewGrid.clientHeight,
    "Larger icons overflow inside the fixed preview viewport",
  )
  modal.style.removeProperty("--ruricon-icon-size")
  modal.style.removeProperty("--ruricon-preset-shortcut-size")
  assert(
    previewGrid.getBoundingClientRect().height === previewHeight,
    "Changing icon size keeps the preview viewport height",
  )
  if (vertical) click(".ruricon-preset-preview-toggle", modal)
  const name = modal.querySelector<HTMLElement>(".ruricon-preset-title")!
  const originalName = name.textContent
  name.textContent = "매우 긴 프리셋 이름 ".repeat(30)
  assert(
    getComputedStyle(name).webkitLineClamp === "2" &&
      name.scrollHeight > name.clientHeight &&
      name.getBoundingClientRect().height <= parseFloat(getComputedStyle(name).lineHeight) * 2 + 1,
    "Long preset names clamp to two lines",
  )
  assert(
    name.nextElementSibling!.getBoundingClientRect().top >= name.getBoundingClientRect().bottom,
    "Icon count remains below the clamped name",
  )
  name.textContent = originalName
  hangulSearch.value = "Slow"
  void act(() => {
    hangulSearch.dispatchEvent(new Event("input"))
  })
  click(".ruricon-preset-title", modal)
  await waitFor(() => releaseSlow !== null)
  if (!vertical) {
    const requestCount = requests.length
    modal.style.width = "969px"
    await waitFor(() => getComputedStyle(detail).visibility === "hidden")
    assert(
      innerWidth > 1200 && getComputedStyle(previewToggle).display !== "none",
      "Container width triggers a single panel even on a wide screen",
    )
    click(".ruricon-preset-preview-toggle", modal)
    assert(
      detail.getAttribute("aria-busy") === "true" &&
        modal.querySelector(".ruricon-preset-status")!.textContent!.includes("불러오는 중"),
      "Pending preview remains loading across panel changes",
    )
    modal.style.width = "970px"
    await waitFor(
      () =>
        getComputedStyle(sidebar).visibility === "visible" &&
        getComputedStyle(previewToggle).display === "none",
    )
    assert(
      hangulSearch.value === "Slow" && requests.length === requestCount,
      "Container transition preserves search and the in-flight request",
    )
    modal.style.removeProperty("width")
    click(".ruricon-preset-preview-toggle", modal)
  }
  hangulSearch.value = "Native"
  void act(() => {
    hangulSearch.dispatchEvent(new Event("input"))
  })
  click(".ruricon-preset-option", modal)
  await waitFor(
    () =>
      modal.querySelectorAll(".ruricon-preset-preview-grid img, .ruricon-preset-preview-grid video")
        .length === 50 &&
      modal.querySelector(".ruricon-preset-detail h2")!.textContent!.includes("Native"),
  )
  assert(
    modal.querySelector<HTMLVideoElement>(".ruricon-preset-preview-grid video")?.src ===
      source(5033, 1),
    "Native preview preserves video and limits the first page to 50",
  )
  releaseSlow!()
  await tick()
  assert(
    modal.querySelectorAll(".ruricon-preset-preview-grid img, .ruricon-preset-preview-grid video")
      .length === 50,
    "Late response does not replace the selected preview",
  )
  hangulSearch.value = "Broken"
  void act(() => {
    hangulSearch.dispatchEvent(new Event("input"))
  })
  click(".ruricon-preset-option", modal)
  await waitFor(() => Boolean(modal.querySelector(".ruricon-preset-detail button")))
  assert(
    modal.querySelector(".ruricon-preset-status")!.textContent!.includes("metadata"),
    "Preview failure is visible",
  )
  const beforeRetry = requests.length
  click(".ruricon-preset-detail button", modal)
  await waitFor(
    () =>
      requests.length > beforeRetry &&
      Boolean(modal.querySelector(".ruricon-preset-detail button")),
  )
  hangulSearch.value = "Native"
  void act(() => {
    hangulSearch.dispatchEvent(new Event("input"))
  })
  click(".ruricon-preset-option", modal)
  await waitFor(
    () =>
      modal.querySelectorAll(".ruricon-preset-preview-grid img, .ruricon-preset-preview-grid video")
        .length === 50,
  )
  const iconPreferences = localStorage.getItem("ruricon:icon-view:v1")
  hangulSearch.value = ""
  void act(() => {
    hangulSearch.dispatchEvent(new Event("input"))
  })
  const openingRows = [...modal.querySelectorAll<HTMLElement>(".ruricon-preset-row")]
  const nativeFavoriteRow = openingRows.find(
    (row) => row.querySelector(".ruricon-preset-title")!.textContent === "Native",
  )!
  const list = modal.querySelector<HTMLElement>(".ruricon-preset-list")!
  list.scrollTop = 60
  const scrollBeforeFavorite = list.scrollTop
  assert(scrollBeforeFavorite > 0, "Favorite scroll check uses a scrollable list")
  if (!vertical) {
    modal.style.width = "969px"
    await waitFor(() => getComputedStyle(previewToggle).display !== "none")
  }
  click(".ruricon-preset-preview-toggle", modal)
  previewGrid.scrollTop = 80
  const previewScroll = previewGrid.scrollTop
  assert(previewScroll > 0, "Preview preservation check uses a scrollable panel")
  click(".ruricon-preset-preview-toggle", modal)
  assert(
    list.scrollTop === scrollBeforeFavorite,
    "Returning to the list preserves its independent scroll",
  )
  click(".ruricon-preset-preview-toggle", modal)
  assert(
    previewGrid.scrollTop === previewScroll,
    "Returning to preview preserves its independent scroll",
  )
  click(".ruricon-preset-preview-toggle", modal)
  if (!vertical) {
    modal.style.removeProperty("width")
    await waitFor(() => getComputedStyle(previewToggle).display === "none")
    assert(
      list.scrollTop === scrollBeforeFavorite,
      "Returning to two columns preserves list scroll",
    )
  }
  const cardTopBeforeFavorite = nativeFavoriteRow.getBoundingClientRect().top
  const focusedFavorite = nativeFavoriteRow.querySelector<HTMLButtonElement>(
    ".ruricon-preset-favorite",
  )!
  focusedFavorite.focus({ preventScroll: true })
  click(".ruricon-preset-favorite", nativeFavoriteRow)
  await tick()
  assert(
    modal.querySelector(".ruricon-preset-row") === nativeFavoriteRow &&
      [...modal.querySelectorAll<HTMLElement>(".ruricon-preset-row")].every((row) =>
        openingRows.includes(row),
      ),
    "Adding a favorite immediately moves its existing card first",
  )
  assert(
    list.scrollTop === scrollBeforeFavorite &&
      document.activeElement === focusedFavorite &&
      nativeFavoriteRow.getBoundingClientRect().top !== cardTopBeforeFavorite,
    "Adding a favorite preserves scroll and keyboard focus while moving the card",
  )
  assert(
    JSON.parse(localStorage.getItem("ruricon:preset-favorites:v1")!).join(",") === "5033",
    "Preset favorites persist under a separate storage key",
  )
  assert(
    localStorage.getItem("ruricon:icon-view:v1") === iconPreferences,
    "Preset favorite toggle leaves icon favorites and history untouched",
  )
  assert(
    nativeFavoriteRow.querySelector(".ruricon-preset-favorite")!.getAttribute("aria-pressed") ===
      "true",
    "Favorite toggle exposes its state",
  )
  assert(
    nativeFavoriteRow.getAttribute("data-favorite") === "true",
    "Favorite card receives the yellow highlight",
  )
  hangulSearch.value = ""
  void act(() => {
    hangulSearch.dispatchEvent(new Event("input"))
  })
  assert(
    countFor("Native") === "205개" && countFor("분할만") === "97개",
    "Cached counts remain visible after switching presets",
  )
  assert(
    modal.querySelector(".ruricon-preset-title")!.textContent === "Native",
    "Open dialog updates favorite sorting immediately",
  )
  assert(
    comment.querySelector(".ruricon-preset-shortcut")?.getAttribute("data-preset-id") === "5033",
    "Picker shortcuts put preset favorites first",
  )
  const favoriteBackground = getComputedStyle(nativeFavoriteRow).backgroundColor
  click(".ruricon-preset-favorite", nativeFavoriteRow)
  await tick()
  assert(
    modal.querySelector(".ruricon-preset-title")!.textContent!.includes("냥냥"),
    "Removing the favorite immediately restores native relative order",
  )
  assert(
    list.scrollTop === scrollBeforeFavorite &&
      nativeFavoriteRow.getBoundingClientRect().top === cardTopBeforeFavorite,
    "Removing a favorite preserves scroll while returning the card to native order",
  )
  assert(
    nativeFavoriteRow.dataset.favorite === "false" &&
      getComputedStyle(nativeFavoriteRow).backgroundColor === favoriteBackground,
    "Selected card keeps its blue background when favorite state changes",
  )
  click(".ruricon-preset-favorite", nativeFavoriteRow)
  click(
    ".ruricon-preset-favorite",
    [...modal.querySelectorAll<HTMLElement>(".ruricon-preset-row")].find((row) =>
      row.querySelector(".ruricon-preset-title")!.textContent!.includes("냥냥"),
    )!,
  )
  await tick()
  assert(
    [...modal.querySelectorAll<HTMLElement>('.ruricon-preset-row[data-favorite="true"]')]
      .map((row) => row.querySelector(".ruricon-preset-title")!.textContent)
      .join(",") === "냥냥 (M),Native",
    "Multiple favorites reorder immediately with the newest first",
  )
  assert(
    JSON.parse(localStorage.getItem("ruricon:preset-favorites:v1")!).join(",") === "900,5033",
    "Newest preset favorite is stored first",
  )
  assert(
    comment.querySelector(".ruricon-preset-shortcut")!.getAttribute("data-preset-id") === "900",
    "Picker uses the saved order within favorites",
  )
  const moveFirst = modal.querySelector<HTMLButtonElement>(".ruricon-preset-move-first")!
  const protectedDelete = modal.querySelector<HTMLButtonElement>(".ruricon-preset-delete")!
  assert(
    !moveFirst.disabled &&
      protectedDelete.disabled &&
      protectedDelete.nextElementSibling === moveFirst,
    "Move to front sits beside disabled Delete for the selected favorite",
  )
  click(".ruricon-preset-move-first", modal)
  await tick()
  assert(
    JSON.parse(localStorage.getItem("ruricon:preset-favorites:v1")!).join(",") === "5033,900" &&
      moveFirst.disabled,
    "Move to front persists the selected favorite first and disables itself",
  )
  assert(
    list.scrollTop === scrollBeforeFavorite &&
      modal.querySelector(".ruricon-preset-row") === nativeFavoriteRow,
    "Move to front reorders the open dialog immediately while preserving scroll",
  )
  assert(
    comment.querySelector(".ruricon-preset-shortcut")!.getAttribute("data-preset-id") === "5033",
    "Picker shares the changed favorite order",
  )
  click(".ruricon-preset-favorite", openingRows[0])
  await tick()
  assert(
    localStorage.getItem("ruricon:icon-view:v1") === iconPreferences,
    "Repeated preset toggles never write icon preferences",
  )
  if (vertical) click(".ruricon-preset-preview-toggle", modal)
  click(".ruricon-preset-heading button", modal)
  await tick()
  assert(
    document.activeElement === comment.querySelector(".ruricon-preset-select"),
    "Close restores focus",
  )
  assert(
    comment.querySelector(".ruricon-preset-select")!.textContent!.includes("냥냥"),
    "Cancel leaves the applied preset unchanged",
  )
  click(".ruricon-preset-select", comment)
  await tick()
  assert(
    getComputedStyle(detail).visibility === (vertical ? "hidden" : "visible"),
    "Reopening resets the vertical layout to the list",
  )
  assert(
    modal.querySelector(".ruricon-preset-title")!.textContent === "Native",
    "Reopening keeps preset favorites first",
  )
  const nativeRow = modal.querySelector<HTMLElement>(".ruricon-preset-row")!
  click(".ruricon-preset-count", nativeRow)
  assert(
    modal.open && comment.querySelector(".ruricon-preset-select")!.textContent!.includes("냥냥"),
    "Preview selection waits for Apply",
  )
  click(".ruricon-preset-apply", modal)
  await tick()
  assert(
    !modal.open && comment.querySelector(".ruricon-preset-select")!.textContent!.includes("Native"),
    "Apply selects the previewed preset",
  )
  void act(cleanup)
  const preferences = JSON.parse(localStorage.getItem("ruricon:icon-view:v1")!)
  preferences.presetId = null
  localStorage.setItem("ruricon:icon-view:v1", JSON.stringify(preferences))
  const unmount = mountCommentIconHook()
  click("button[onclick]", comment)
  await tick()
  assert(
    comment.querySelector(".ruricon-preset-shortcut")!.getAttribute("data-preset-id") === "5033",
    "Remount restores preset favorites from separate storage",
  )
  assert(
    comment.querySelector(".ruricon-preset-select")!.textContent!.includes("Native"),
    "Default selection follows preset favorites when the last selection is missing",
  )
  click(".ruricon-preset-select", comment)
  await tick()
  const deletionDialog = document.querySelector<HTMLDialogElement>("dialog")!
  assert(
    !deletionDialog.querySelector(".ruricon-preset-heading .ruricon-preset-delete"),
    "Delete appears only in the footer",
  )
  const deleteButton = deletionDialog.querySelector<HTMLButtonElement>(".ruricon-preset-delete")!
  assert(deleteButton.disabled, "Favorite preset cannot be deleted")
  void act(() => {
    deleteButton.dispatchEvent(new MouseEvent("click", { bubbles: true }))
  })
  assert(removalCalls.length === 0, "Favorite protection also prevents programmatic deletion")
  const protectedRow = deletionDialog.querySelector<HTMLElement>(
    '.ruricon-preset-row[data-selected="true"]',
  )!
  click(".ruricon-preset-favorite", protectedRow)
  await tick()
  assert(!deleteButton.disabled, "Removing the favorite enables Delete")
  assert(
    !deletionDialog.querySelector(".ruricon-preset-move-first"),
    "Non-favorite presets do not show Move to front",
  )
  const footerButtons = [
    ...deletionDialog.querySelectorAll<HTMLButtonElement>(".ruricon-preset-footer button"),
  ].filter((button) => getComputedStyle(button).display !== "none")
  assert(
    deleteButton.getBoundingClientRect().left < footerButtons.at(-1)!.getBoundingClientRect().left,
    "Footer delete stays on the left of Apply",
  )
  const beforeRemovalPreferences = localStorage.getItem("ruricon:icon-view:v1")
  confirmDeletion = false
  click(".ruricon-preset-delete", deletionDialog)
  assert(removalCalls.length === 0, "Canceled removal sends no request")
  confirmDeletion = true
  click(".ruricon-preset-delete", deletionDialog)
  await waitFor(
    () =>
      deletionDialog
        .querySelector(".ruricon-preset-footer [role='status']")
        ?.textContent?.includes("삭제하지 못했습니다") === true,
  )
  assert(
    [...deletionDialog.querySelectorAll(".ruricon-preset-title")].some(
      (title) => title.textContent === "Native",
    ),
    "Failed removal keeps the preset in the list",
  )
  failRemovalId = null
  holdRemoval = true
  click(".ruricon-preset-delete", deletionDialog)
  await waitFor(() => releaseRemoval !== null)
  const pendingRemovalCalls = removalCalls.length
  click(".ruricon-preset-delete", deletionDialog)
  assert(
    deleteButton.disabled &&
      removalCalls.length === pendingRemovalCalls &&
      deletionDialog.querySelector<HTMLButtonElement>(".ruricon-preset-close")!.disabled,
    "Pending deletion prevents duplicate requests and closing",
  )
  const cancel = new Event("cancel", { cancelable: true })
  deletionDialog.dispatchEvent(cancel)
  assert(cancel.defaultPrevented, "Escape cannot close the dialog during deletion")
  void act(() => {
    deletionDialog.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 0, clientY: 0 }))
  })
  assert(deletionDialog.open, "Backdrop cannot cancel pending deletion")
  holdRemoval = false
  releaseRemoval!()
  await waitFor(
    () =>
      !deleteButton.disabled &&
      ![...deletionDialog.querySelectorAll(".ruricon-preset-title")].some(
        (title) => title.textContent === "Native",
      ),
  )
  assert(
    !comment.querySelector('[data-preset-id="5033"]'),
    "Successful deletion also removes the Picker shortcut",
  )
  assert(
    localStorage.getItem("ruricon:icon-view:v1") === beforeRemovalPreferences,
    "Deleting a preset leaves icon favorites and history untouched",
  )
  assert(
    JSON.parse(localStorage.getItem("ruricon:preset-favorites:v1")!).length === 0,
    "Deleted preset is removed from local preset favorites",
  )
  failRemovalId = 901
  click(".ruricon-preset-delete", deletionDialog)
  await waitFor(
    () =>
      deletionDialog
        .querySelector(".ruricon-preset-footer [role='status']")
        ?.textContent?.includes("삭제하지 못했습니다") === true,
  )
  assert(
    removalCalls.slice(-2).join(",") === "900,901",
    "Master removal uses its actual Main and Segment favorite IDs",
  )
  failRemovalId = null
  click(".ruricon-preset-delete", deletionDialog)
  await waitFor(
    () =>
      !deleteButton.disabled &&
      ![...deletionDialog.querySelectorAll(".ruricon-preset-title")].some((title) =>
        title.textContent!.includes("냥냥"),
      ),
  )
  assert(
    removalCalls.slice(-3).join(",") === "900,901,901",
    "Retry skips IDs already removed by a partially successful operation",
  )
  const slaveOnly = (await loadPresets()).find((preset) => preset.id === 920)!
  await removePresetFavorites(slaveOnly)
  assert(
    removalCalls.at(-1) === 910,
    "Slave-only preset removes the actual favorite ID rather than the derived Main ID",
  )
  assert(
    !(await loadPresets()).some((preset) => [5033, 900, 920].includes(preset.id)),
    "Deletion invalidates cached presets and subsequent reads reflect server removals",
  )
  const beforeHideCalls = removalCalls.length
  const beforeHideIconPreferences = localStorage.getItem("ruricon:icon-view:v1")
  for (const ad of ["AD1", "AD2"]) {
    const adRow = [...deletionDialog.querySelectorAll<HTMLElement>(".ruricon-preset-row")].find(
      (row) => row.querySelector(".ruricon-preset-title")!.textContent === ad,
    )!
    click(".ruricon-preset-option", adRow)
    assert(
      deletionDialog.querySelector(".ruricon-preset-hide")!.textContent === "숨기기" &&
        !deletionDialog.querySelector(".ruricon-preset-delete"),
      "Ad preset offers local Hide instead of server Delete",
    )
    click(".ruricon-preset-hide", deletionDialog)
    await tick()
    assert(
      adRow.isConnected &&
        adRow.dataset.hidden === "true" &&
        getComputedStyle(adRow).borderStyle === "dashed" &&
        Number(getComputedStyle(adRow.querySelector(".ruricon-preset-option")!).opacity) < 1,
      "Hidden ad stays in the modal as a muted outline card",
    )
    assert(
      deletionDialog.querySelector(".ruricon-preset-hide")!.textContent === "복원" &&
        deletionDialog.querySelector<HTMLButtonElement>(".ruricon-preset-apply")!.disabled,
      "Hidden selection offers Restore and cannot be applied",
    )
  }
  assert(removalCalls.length === beforeHideCalls, "Hiding ads never calls the removal API")
  assert(
    localStorage.getItem("ruricon:icon-view:v1") === beforeHideIconPreferences,
    "Hiding ads does not change icon favorites or history",
  )
  assert(
    JSON.parse(localStorage.getItem("ruricon:hidden-ad-presets:v1")!).sort().join(",") ===
      "1917,3213",
    "Hidden ads persist in separate local storage",
  )
  assert(
    !comment.querySelector('[data-preset-id="1917"], [data-preset-id="3213"]'),
    "Hidden ads disappear from Picker shortcuts",
  )
  assert(
    (await loadPresets()).some((preset) => preset.id === 1917),
    "Hidden ads remain in the backend result",
  )
  void act(unmount)
  const adPreferences = JSON.parse(localStorage.getItem("ruricon:icon-view:v1")!)
  adPreferences.presetId = 1917
  localStorage.setItem("ruricon:icon-view:v1", JSON.stringify(adPreferences))
  // Ignore malformed entries without hiding ordinary presets.
  localStorage.setItem(
    "ruricon:hidden-ad-presets:v1",
    JSON.stringify([1917, 3213, 940, "1917", null]),
  )
  const unmountHidden = mountCommentIconHook()
  click("button[onclick]", comment)
  await tick()
  assert(
    !comment.querySelector('[data-preset-id="1917"], [data-preset-id="3213"]') &&
      comment.querySelector('[data-preset-id="940"]'),
    "Remount restores hidden ads and rejects non-ad IDs",
  )
  assert(
    !comment.querySelector(".ruricon-preset-select")!.textContent!.includes("AD1"),
    "A saved hidden ad selection falls back to an available preset",
  )
  click(".ruricon-preset-select", comment)
  await tick()
  assert(
    document.querySelectorAll('.ruricon-preset-row[data-hidden="true"]').length === 2,
    "Hidden ads remain available for restoring on the next modal opening",
  )
  const restoreDialog = document.querySelector<HTMLDialogElement>("dialog")!
  const restoreRow = [...restoreDialog.querySelectorAll<HTMLElement>(".ruricon-preset-row")].find(
    (row) => row.querySelector(".ruricon-preset-title")!.textContent === "AD1",
  )!
  click(".ruricon-preset-option", restoreRow)
  assert(
    restoreDialog.querySelector(".ruricon-preset-hide")!.textContent === "복원",
    "Muted card remains selectable for restoring",
  )
  click(".ruricon-preset-hide", restoreDialog)
  await tick()
  assert(
    restoreRow.dataset.hidden === "false" &&
      getComputedStyle(restoreRow).borderStyle === "solid" &&
      restoreDialog.querySelector(".ruricon-preset-hide")!.textContent === "숨기기",
    "Restore reactivates the card and returns the action to Hide",
  )
  assert(
    !restoreDialog.querySelector<HTMLButtonElement>(".ruricon-preset-apply")!.disabled &&
      comment.querySelector('[data-preset-id="1917"]'),
    "Restored ad can be applied and returns to Picker",
  )
  assert(
    JSON.parse(localStorage.getItem("ruricon:hidden-ad-presets:v1")!).join(",") === "3213" &&
      removalCalls.length === beforeHideCalls,
    "Restore changes only local hidden state without backend deletion",
  )
  click(".ruricon-preset-hide", restoreDialog)
  await tick()
  assert(
    restoreRow.getAttribute("data-hidden") === "true" &&
      !comment.querySelector('[data-preset-id="1917"]'),
    "Restored card can be hidden again",
  )
  void act(unmountHidden)
}
async function checkInitialShortcutPage() {
  const comment = document.querySelector<HTMLElement>("#comment")!
  comment.style.maxWidth = "240px"
  for (const presetFavorites of [[920], []]) {
    localStorage.setItem(
      "ruricon:icon-view:v1",
      JSON.stringify({ presetId: 5033, favorites: [], recent: [] }),
    )
    localStorage.setItem("ruricon:preset-favorites:v1", JSON.stringify(presetFavorites))
    const unmount = mountCommentIconHook()
    click("button[onclick]", comment)
    await tick()
    const strip = comment.querySelector<HTMLElement>(".ruricon-preset-strip")!
    assert(
      comment.querySelector(".ruricon-preset-select")!.textContent!.includes("Native"),
      "Opening retains the saved preset",
    )
    assert(
      strip.firstElementChild?.getAttribute("data-preset-id") ===
        String(presetFavorites.length ? 920 : 900),
      "Opening shows shortcut page zero with favorites first",
    )
    if (location.hostname !== "m.ruliweb.com") {
      const previous = comment.querySelector<HTMLButtonElement>(".ruricon-preset-arrow")!
      assert(
        previous.disabled,
        "Initial shortcut page is zero even when the selected preset is on a later page",
      )
      click(".ruricon-preset-arrow:last-child", comment)
      assert(!previous.disabled, "Manual shortcut paging still works")
    } else assert(strip.scrollLeft === 0, "Mobile starts at the beginning of the shortcut strip")
    await choose("냥냥", comment)
    assert(
      strip.querySelector('[data-preset-id="900"]')?.getAttribute("aria-pressed") === "true",
      "Later explicit selection still navigates to the selected shortcut",
    )
    void act(unmount)
  }
}
async function checkModalScrollLock() {
  const comment = document.querySelector<HTMLElement>("#comment")!
  const spacer = document.createElement("div")
  spacer.style.height = "200vh"
  document.body.append(spacer)
  const roots = [document.documentElement, document.body]
  const previousStyles = roots.map((root) => root.style.cssText)
  const previousOverflow = roots.map((root) => getComputedStyle(root).overflow)
  click("button[onclick]", comment)
  await tick()
  for (const closeMethod of ["button", "backdrop", "native", "unmount"]) {
    click(".ruricon-preset-select", comment)
    await tick()
    const dialog = document.querySelector<HTMLDialogElement>("dialog")!
    assert(
      dialog.matches(":modal") &&
        roots.every((root) => getComputedStyle(root).overflow === "hidden"),
      "Open modal locks background document scrolling",
    )
    const list = dialog.querySelector<HTMLElement>(".ruricon-preset-list")!
    list.scrollTop = 50
    assert(
      getComputedStyle(list).overflowY === "auto" && list.scrollTop > 0,
      "Modal list remains scrollable",
    )
    if (closeMethod === "backdrop") {
      const bounds = dialog.getBoundingClientRect()
      void act(() => {
        dialog.dispatchEvent(
          new MouseEvent("click", {
            bubbles: true,
            clientX: bounds.left + 2,
            clientY: bounds.top + 2,
          }),
        )
      })
      assert(dialog.open, "Clicking dialog padding does not cancel")
      click("input", dialog)
      assert(dialog.open, "Clicks inside the dialog do not cancel")
      const savedBeforeBackdrop = localStorage.getItem("ruricon:icon-view:v1")
      const presetBeforeBackdrop = comment.querySelector(".ruricon-preset-select")!.textContent
      click(".ruricon-preset-row:last-child .ruricon-preset-option", dialog)
      void act(() => {
        dialog.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 0, clientY: 0 }))
      })
      assert(
        !dialog.open &&
          localStorage.getItem("ruricon:icon-view:v1") === savedBeforeBackdrop &&
          comment.querySelector(".ruricon-preset-select")!.textContent === presetBeforeBackdrop,
        "Backdrop click cancels without applying the pending selection",
      )
    } else if (closeMethod === "button") click(".ruricon-preset-cancel", dialog)
    else if (closeMethod === "native") void act(() => dialog.close())
    else void act(cleanup)
    await tick()
    assert(
      roots.every(
        (root, index) =>
          getComputedStyle(root).overflow === previousOverflow[index] &&
          root.style.cssText === previousStyles[index],
      ),
      "Button close, native close and unmount restore original document styles",
    )
  }
  spacer.remove()
}
async function check() {
  if (location.search === "?modal-scroll-lock") {
    await checkModalScrollLock()
    result.textContent =
      "PASS: modal background scroll lock, internal scrolling and cleanup on button/native close/unmount"
    result.dataset.result = "PASS"
    return
  }
  if (location.search === "?initial-shortcut-page") {
    void act(cleanup)
    await checkInitialShortcutPage()
    result.textContent =
      "PASS: shortcut page zero on first open, favorites first, saved preset retained and later navigation"
    result.dataset.result = "PASS"
    return
  }
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
  if (location.search === "?image-preset") {
    const manage = comment.querySelector<HTMLAnchorElement>(".ruricon-preset-manage")!
    assert(
      manage.parentElement?.classList.contains("ruricon-icon-actions") &&
        !manage.parentElement.hidden &&
        !comment.querySelector(".ruricon-preset-controls"),
      "Management link sits in the visible icon actions and leaves the preset selector unchanged",
    )
    assert(
      manage.href ===
        `https://${location.hostname === "m.ruliweb.com" ? "m" : "bbs"}.ruliweb.com/member/mypage/comment_icon_setting` &&
        manage.target === "_blank" &&
        manage.rel.includes("noopener") &&
        manage.querySelector("svg"),
      "Native preset management uses the site domain and opens safely in a new window",
    )
    assert(
      getComputedStyle(manage).borderRadius ===
        getComputedStyle(comment.querySelector(".ruricon-preset-select")!).borderRadius,
      "Management link uses the button design",
    )
    const storageTab = '.ruricon-icon-tabs button[aria-label="개인 저장소"]'
    const images = () => [...comment.querySelectorAll<HTMLImageElement>(".ruricon-icon-grid img")]
    const status = () => comment.querySelector('[role="status"]')!.textContent!
    const retry = () => click(".ruricon-icon-view > button:not([hidden]):last-of-type", comment)
    const openStorage = async () => {
      click(storageTab, comment)
      await tick()
    }
    assert(!requests.some((url) => url.includes("type=preset")), "Storage loads only on demand")
    await openStorage()
    assert(images().length === 48, "Storage renders 48 images without pagination")
    assert(comment.querySelector<HTMLElement>(".ruricon-icon-pages")!.hidden, "Storage hides pages")
    assert(images()[0].src === source(999, 0), "Storage preserves image URLs and order")
    click(".ruricon-icon-insert", comment)
    await tick()
    assert(
      comment.querySelector<HTMLImageElement>(".icon_preview")!.src === source(999, 0),
      "Storage inserts into the owning comment",
    )
    assert(
      JSON.parse(localStorage.getItem("ruricon:icon-view:v1")!).recent[0] === source(999, 0),
      "Storage insertion records recent use",
    )
    click(".ruricon-icon-star", comment)
    assert(
      JSON.parse(localStorage.getItem("ruricon:icon-view:v1")!).favorites.includes(source(999, 0)),
      "Storage supports local favorites",
    )
    storageCount = 0
    await openStorage()
    assert(
      !images().length && comment.querySelector(".ruricon-icon-empty"),
      "Empty storage shows the empty state",
    )
    storageCount = 49
    await openStorage()
    assert(images().length === 48, "Storage displays at most 48 images")
    storageSuccess = false
    await openStorage()
    assert(status().includes("개인 저장소를 불러오지 못했습니다."), "API failure is shown")
    storageSuccess = true
    storageCount = 1
    retry()
    await tick()
    assert(images().length === 1 && !status(), "Retry reloads storage")
    storageStatus = 503
    await openStorage()
    assert(status().includes("503"), "HTTP failure is shown")
    storageStatus = 200
    holdStorage = true
    await openStorage()
    assert(releaseStorage, "Storage request is pending")
    click('.ruricon-icon-tabs button[aria-label="즐겨찾기"]', comment)
    releaseStorage()
    await tick()
    assert(
      comment.querySelector(storageTab)!.getAttribute("aria-pressed") === "false" && !status(),
      "Late storage response does not change another tab",
    )
    click('.ruricon-icon-tabs button[aria-label="전체"]', comment)
    assert(images().length === 96, "Returning to All preserves the selected collection")
    void act(cleanup)
    result.textContent =
      "PASS: personal storage 0–48 images, insertion, favorites/recent, errors, retry and tab races"
    result.dataset.result = "PASS"
    return
  }
  if (location.search === "?preset-dialog") {
    await checkPresetDialog(comment)
    result.textContent =
      "PASS: preset dialog links, Segment 1/native 50-icon preview, local ordering, shared Picker order, persistence, Apply and focus"
    result.dataset.result = "PASS"
    return
  }
  assert(
    comment.querySelectorAll(".ruricon-icon-grid img").length === 96,
    "One whole segment is rendered",
  )
  assert(
    comment.querySelector(".ruricon-preset-select")!.textContent!.includes("냥냥"),
    "Metadata set name",
  )
  const selectedThumbnail = comment.querySelector<HTMLImageElement>(
    ".ruricon-preset-select > .ruricon-preset-thumbnail",
  )!
  assert(
    selectedThumbnail.src === source(900, 0),
    "Preset selector uses Main thumbnail on the left",
  )
  assert(
    comment.querySelector<HTMLElement>(".ruricon-icon-insert")!.getBoundingClientRect().width ===
      iconSize,
    "Grid icon size follows the site domain",
  )
  const numbers = [...comment.querySelectorAll(".ruricon-icon-pages button")].map(
    (button) => button.textContent,
  )
  assert(numbers.join(",") === "1,3", "Segment page numbers and order")
  assert(!comment.querySelector(".ruricon-icon-count"), "Redundant info row is removed")
  const toolbar = comment.querySelector<HTMLElement>(".ruricon-icon-toolbar")!
  const tabs = comment.querySelector<HTMLElement>(".ruricon-icon-tabs")!
  const iconPages = comment.querySelector<HTMLElement>(".ruricon-icon-pages")!
  const pageButton = iconPages.querySelector<HTMLButtonElement>("button")!
  const tabStyle = getComputedStyle(tabs.querySelector("button")!)
  assert(tabStyle.borderWidth === "0px" && tabStyle.borderRadius === "999px", "Borderless chips")
  const pageStyle = getComputedStyle(pageButton)
  assert(
    pageStyle.borderRadius === "50%" &&
      pageButton.offsetWidth === 32 &&
      pageButton.offsetHeight === 32,
    "Page buttons are compact circles",
  )
  assert(
    tabs.getBoundingClientRect().top < iconPages.getBoundingClientRect().bottom &&
      iconPages.getBoundingClientRect().top < tabs.getBoundingClientRect().bottom,
    "Short page list shares one row with tabs on desktop and mobile",
  )
  const extraPages = Array.from({ length: 18 }, (_, index) => {
    const button = pageButton.cloneNode(true) as HTMLButtonElement
    button.removeAttribute("aria-current")
    button.textContent = String(index + 4)
    iconPages.append(button)
    return button
  })
  for (const width of [720, 651, 360]) {
    ;(comment as HTMLElement).style.maxWidth = `${width}px`
    assert(
      iconPages.getBoundingClientRect().top >= tabs.getBoundingClientRect().bottom &&
        Math.abs(iconPages.getBoundingClientRect().left - toolbar.getBoundingClientRect().left) < 1,
      `Twenty pages move below tabs and align left at ${width}px`,
    )
    assert(
      toolbar.scrollWidth <= toolbar.clientWidth &&
        iconPages.scrollWidth <= iconPages.clientWidth &&
        tabs.scrollWidth <= tabs.clientWidth &&
        pageButton.offsetWidth === 32,
      `Many pages wrap without horizontal scrolling or shrinking buttons at ${width}px`,
    )
    assert(
      extraPages.at(-1)!.getBoundingClientRect().top > pageButton.getBoundingClientRect().top &&
        extraPages.at(-1)!.getBoundingClientRect().right <= iconPages.getBoundingClientRect().right,
      `Last page stays visible on a wrapped line at ${width}px`,
    )
  }
  for (const button of extraPages.slice(8)) button.remove()
  ;(comment as HTMLElement).style.maxWidth = "651px"
  assert(
    iconPages.getBoundingClientRect().top >= tabs.getBoundingClientRect().bottom &&
      extraPages[7].getBoundingClientRect().top === pageButton.getBoundingClientRect().top,
    "Ten pages move together to the next row at 651px",
  )
  ;(comment as HTMLElement).style.maxWidth = "720px"
  assert(
    iconPages.getBoundingClientRect().top < tabs.getBoundingClientRect().bottom,
    "Ten pages return to the same row when space is available",
  )
  for (const button of extraPages) button.remove()
  ;(comment as HTMLElement).style.maxWidth = "360px"
  assert(
    iconPages.getBoundingClientRect().top >= tabs.getBoundingClientRect().bottom,
    "Narrow picker uses two rows for short page lists too",
  )
  ;(comment as HTMLElement).style.maxWidth = "720px"
  assert(
    comment
      .querySelector(".ruricon-preset-select")!
      .compareDocumentPosition(comment.querySelector(".ruricon-icon-pages")!) &
      Node.DOCUMENT_POSITION_FOLLOWING,
    "Page buttons follow preset selector",
  )
  assert(
    comment
      .querySelector(".ruricon-icon-pages")!
      .compareDocumentPosition(comment.querySelector(".ruricon-icon-grid")!) &
      Node.DOCUMENT_POSITION_FOLLOWING,
    "Page buttons precede grid",
  )
  assert(requests.filter((url) => url.includes("/read/")).length === 1, "No eager N+1 reads")
  assert(
    getComputedStyle(comment.querySelector(".ruricon-icon-star")!).display === "none",
    "Favorite buttons are hidden by default",
  )
  enableEditMode(comment)
  click(".ruricon-icon-pages button:last-child", comment)
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
  const tile = comment.querySelector<HTMLElement>(".ruricon-icon-tile")!
  const favorite = tile.querySelector<HTMLButtonElement>(".ruricon-icon-star")!
  const tileBounds = tile.getBoundingClientRect()
  const favoriteBounds = favorite.getBoundingClientRect()
  assert(getComputedStyle(favorite).position === "absolute", "Favorite overlays the icon")
  assert(
    getComputedStyle(favorite).backgroundColor === "rgba(255, 255, 255, 0.376)" &&
      getComputedStyle(favorite).backdropFilter === "blur(2px)" &&
      getComputedStyle(favorite).borderWidth === "1px" &&
      getComputedStyle(favorite).borderRadius === "50%",
    "Inactive favorite is translucent and blurred with a thin circular border",
  )
  assert(
    getComputedStyle(favorite).boxShadow !== "none" &&
      getComputedStyle(favorite.querySelector("svg")!).filter === "none",
    "Favorite button has a small shadow without an extra icon shadow",
  )
  assert(
    favoriteBounds.bottom === tileBounds.bottom - 3 &&
      favoriteBounds.right === tileBounds.right - 3 &&
      tileBounds.height ===
        tile.querySelector(".ruricon-icon-insert")!.getBoundingClientRect().height,
    "Favorite stays at the bottom right without adding a row",
  )
  click(".ruricon-icon-star", comment)
  assert(
    getComputedStyle(comment.querySelector(".ruricon-icon-star")!).backgroundColor ===
      "rgb(255, 255, 255)" &&
      getComputedStyle(comment.querySelector(".ruricon-icon-star")!).backdropFilter === "none",
    "Selected favorite button stays opaque white without blur",
  )
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
  const existingVideo = scrollingGrid.querySelector<HTMLVideoElement>("video")!
  assert(existingVideo?.src === nativeSource(5033, 1), "Video removes the icon query")
  assert(scrollingGrid.scrollHeight > scrollingGrid.clientHeight, "Full page scrolls vertically")
  scrollingGrid.scrollTop = 150
  const favoriteScrollTop = scrollingGrid.scrollTop
  assert(favoriteScrollTop > 0, "Favorite regression starts with a scrolled grid")
  for (const pressed of ["true", "false"]) {
    const favoriteButton = scrollingGrid.querySelector<HTMLButtonElement>(".ruricon-icon-star")!
    const existingImage = scrollingGrid.querySelector("img")!
    favoriteButton.focus({ preventScroll: true })
    click(".ruricon-icon-star", scrollingGrid)
    assert(scrollingGrid.querySelector("img") === existingImage, "Favorite preserves image DOM")
    assert(scrollingGrid.querySelector("video") === existingVideo, "Favorite preserves video DOM")
    assert(document.activeElement === favoriteButton, "Favorite preserves keyboard focus")
    assert(
      scrollingGrid.querySelector(".ruricon-icon-star")!.getAttribute("aria-pressed") === pressed,
      "Favorite toggles while scrolled",
    )
    assert(scrollingGrid.scrollTop === favoriteScrollTop, "Favorite toggle preserves grid scroll")
  }
  click(".ruricon-icon-insert", existingVideo.closest(".ruricon-icon-tile")!)
  await tick()
  assert(
    comment.querySelector<HTMLImageElement>(".icon_preview")?.src === nativeSource(5033, 1),
    "Video insertion passes the hidden image to the native adapter",
  )
  assert(comment.querySelectorAll(".ruricon-icon-pages button").length === 3, "Native page count")
  click(".ruricon-icon-pages button:nth-child(2)", comment)
  await tick()
  assert(scrollingGrid.scrollTop === 0, "Changing icon pages still resets grid scroll")
  assert(comment.querySelector('[role="status"]')!.textContent!.includes("503"), "Failure visible")
  const retry = [...comment.querySelectorAll<HTMLButtonElement>("button")].find(
    (button) => button.textContent === "다시 시도",
  )!
  void act(() => retry.click())
  await tick()
  assert(
    comment.querySelectorAll(".ruricon-icon-grid img").length === 100,
    "Retry loads offset page without header",
  )
  assert(
    comment.querySelector<HTMLImageElement>(".ruricon-icon-grid img")!.src ===
      nativeSource(5033, 100),
    "Offset page removes the icon query",
  )
  click(".ruricon-icon-pages button:last-child", comment)
  await tick()
  assert(comment.querySelectorAll(".ruricon-icon-grid img").length === 5, "Last partial fetch page")
  click(".ruricon-icon-pages button:first-child", comment)
  assert(comment.querySelectorAll(".ruricon-icon-grid img").length === 100, "Back to cached page")
  const originalImages = [...scrollingGrid.querySelectorAll<HTMLImageElement>("img")]
  const favoriteTiles = originalImages
    .slice(1, 3)
    .map((image) => image.closest<HTMLElement>(".ruricon-icon-tile")!)
  for (const favoriteTile of [...favoriteTiles].reverse()) click(".ruricon-icon-star", favoriteTile)
  const orderedSources = () =>
    [...scrollingGrid.querySelectorAll<HTMLImageElement>("img")].map((image) => image.src)
  assert(
    orderedSources().join(",") ===
      [...originalImages.slice(1, 3), originalImages[0], ...originalImages.slice(3)]
        .map((image) => image.src)
        .join(","),
    "Favorites come first while preserving original order within both groups",
  )
  for (const favoriteTile of favoriteTiles) {
    const insertButton = favoriteTile.querySelector<HTMLElement>(".ruricon-icon-insert")!
    const border = getComputedStyle(insertButton)
    assert(
      border.borderColor === "rgb(233, 163, 35)" && border.borderWidth === "2px",
      "Favorite icon has an amber border",
    )
    assert(
      insertButton.offsetWidth === iconSize && insertButton.offsetHeight === iconSize,
      "Favorite border preserves tile size",
    )
    const starSize = favoriteTile
      .querySelector<HTMLElement>(".ruricon-icon-star")!
      .getBoundingClientRect()
    assert(
      starSize.width === iconSize / 4 && starSize.height === iconSize / 4,
      "Favorite button is one quarter of the icon size",
    )
  }
  click(".ruricon-icon-pages button:nth-child(2)", comment)
  click(".ruricon-icon-pages button:first-child", comment)
  assert(orderedSources()[0] === originalImages[1].src, "Loading a page puts saved favorites first")
  for (const image of originalImages.slice(1, 3)) {
    const favoriteTile = [
      ...scrollingGrid.querySelectorAll<HTMLElement>(".ruricon-icon-tile"),
    ].find((item) => item.querySelector<HTMLImageElement>("img")!.src === image.src)!
    click(".ruricon-icon-star", favoriteTile)
  }
  assert(
    orderedSources().join(",") === originalImages.map((image) => image.src).join(","),
    "Removing favorites restores original order",
  )
  assert(
    getComputedStyle(
      scrollingGrid.querySelector('.ruricon-icon-tile[data-recent="false"] .ruricon-icon-insert')!,
    ).borderWidth === "1px",
    "Normal icons retain their original border",
  )
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
  enableEditMode(reply)
  assert(
    reply.querySelector(".ruricon-icon-view")!.getAttribute("data-edit-mode") === "true" &&
      comment.querySelector(".ruricon-icon-view")!.getAttribute("data-edit-mode") === "true",
    "Comment and reply share edit mode",
  )
  const mobileGrid = reply.querySelector<HTMLElement>(".ruricon-icon-grid")!
  assert(mobileGrid.scrollWidth <= mobileGrid.clientWidth, "Narrow reply grid fits horizontally")
  for (const pressed of ["true", "false"]) {
    click(".ruricon-icon-star", reply)
    assert(
      comment.querySelector(".ruricon-icon-star")!.getAttribute("aria-pressed") === pressed,
      "Comment and reply react to shared favorites",
    )
  }
  const setItem = Storage.prototype.setItem
  try {
    Storage.prototype.setItem = () => {
      throw new Error("Storage unavailable")
    }
    click(".ruricon-icon-star", reply)
    assert(
      comment.querySelector(".ruricon-icon-star")!.getAttribute("aria-pressed") === "true" &&
        reply.querySelector('[role="status"]')!.textContent!.includes("저장할 수 없습니다"),
      "Storage failure keeps shared in-memory state and reports the failure",
    )
  } finally {
    Storage.prototype.setItem = setItem
  }
  click(".ruricon-icon-star", reply)
  assert(
    !reply.querySelector('[role="status"]')!.textContent!.includes("저장할 수 없습니다"),
    "Successful persistence clears the storage failure",
  )
  click(".ruricon-preset-select", reply)
  const modal = document.querySelector<HTMLDialogElement>("dialog")!
  assert(modal.open, "Native dialog opens")
  const presetRow = modal.querySelector<HTMLElement>(".ruricon-preset-row")!
  assert(
    presetRow.querySelector(".ruricon-preset-option > .ruricon-preset-thumbnail"),
    "Preset row thumbnail precedes label",
  )
  assert(getComputedStyle(presetRow).display === "flex", "Preset thumbnail and label share a row")
  assert(document.activeElement === modal.querySelector("input"), "Search receives focus")
  const hangulSearch = modal.querySelector<HTMLInputElement>("input")!
  for (const query of ["냐", "ㄴㄴ"]) {
    hangulSearch.value = query
    void act(() => {
      hangulSearch.dispatchEvent(new Event("input"))
    })
    assert(
      modal.querySelectorAll(".ruricon-preset-row").length === 1,
      "Hangul composition and choseong filter preset rows",
    )
    assert(
      modal.querySelector(".ruricon-preset-row")!.textContent!.includes("냥냥"),
      "Matching Hangul preset remains visible",
    )
  }
  modal.close()
  await waitFor(() => document.activeElement === reply.querySelector(".ruricon-preset-select"))
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
  click(".ruricon-preset-select", comment)
  assert(document.querySelector("dialog") === modal, "Comment and reply reuse one native dialog")
  assert(modal.querySelector<HTMLInputElement>("input")!.value === "", "Reopening resets search")
  click(".ruricon-preset-cancel", modal)
  assert(!modal.open, "Dialog button closes the controlled modal")
  const shortcutRow = reply.querySelector<HTMLElement>(".ruricon-preset-shortcuts")!
  const strip = shortcutRow.querySelector<HTMLElement>(".ruricon-preset-strip")!
  const shortcut = strip.querySelector<HTMLElement>(".ruricon-preset-shortcut")!
  const thumbnail = shortcut.querySelector<HTMLElement>(".ruricon-preset-thumbnail")!
  assert(
    shortcut.getBoundingClientRect().width === iconSize * 0.8 &&
      shortcut.getBoundingClientRect().height === iconSize * 0.8,
    "Shortcut button uses 80 percent of the icon size",
  )
  assert(
    thumbnail.getBoundingClientRect().width === iconSize * 0.8 &&
      thumbnail.getBoundingClientRect().height === iconSize * 0.8,
    "Thumbnail matches shortcut button size",
  )
  assert(
    reply.querySelector(".ruricon-preset-select")!.compareDocumentPosition(shortcutRow) &
      Node.DOCUMENT_POSITION_FOLLOWING,
    "Shortcuts follow preset selector",
  )
  assert(
    shortcutRow.compareDocumentPosition(reply.querySelector(".ruricon-icon-tabs")!) &
      Node.DOCUMENT_POSITION_FOLLOWING,
    "Shortcuts precede view tabs",
  )
  if (location.hostname === "m.ruliweb.com") {
    ;(reply as HTMLElement).style.maxWidth = "240px"
    assert(!shortcutRow.querySelector(".ruricon-preset-arrow"), "Mobile has no page arrows")
    assert(
      strip.children.length === (await loadPresets()).length,
      "Mobile shows all shortcuts in one strip",
    )
    assert(strip.scrollWidth > strip.clientWidth, "Mobile strip scrolls horizontally")
    strip.scrollLeft = strip.scrollWidth
    assert(strip.scrollLeft > 0, "Mobile strip can scroll")
  } else {
    const arrows = shortcutRow.querySelectorAll<HTMLButtonElement>(".ruricon-preset-arrow")
    assert(arrows.length === 2, "Desktop has page arrows")
    for (const [index, arrow] of arrows.entries()) {
      assert(
        arrow.querySelector("svg path")?.getAttribute("d") ===
          (index === 0 ? "m15 18-6-6 6-6" : "m9 18 6-6-6-6"),
        "Page arrows use directional Lucide icons",
      )
      assert(getComputedStyle(arrow).borderWidth === "0px", "Page arrows have no border")
    }
    void act(() => arrows[0].click())
    assert(arrows[0].disabled && !arrows[1].disabled, "Desktop first page has only next enabled")
    assert(strip.scrollWidth <= strip.clientWidth, "Desktop fits whole thumbnails in one row")
    const firstId = strip.firstElementChild?.getAttribute("data-preset-id")
    const beforePaging = requests.length
    void act(() => arrows[1].click())
    assert(
      strip.firstElementChild?.getAttribute("data-preset-id") !== firstId,
      "Desktop arrows change thumbnail page",
    )
    assert(requests.length === beforePaging, "Shortcut paging doesn't fetch collections")
    while (!arrows[1].disabled) void act(() => arrows[1].click())
    assert(arrows[1].disabled, "Last shortcut page disables next")
    ;(reply as HTMLElement).style.maxWidth = "240px"
    void act(() => arrows[0].click())
    assert(strip.children.length === 1, "Narrow desktop page fits one 80px thumbnail")
    assert(strip.scrollWidth <= strip.clientWidth, "Resize recomputes desktop page capacity")
    while (!arrows[0].disabled) void act(() => arrows[0].click())
    shortcutRow.style.setProperty("--ruricon-preset-shortcut-size", "100px")
    click('[data-preset-id="900"]', strip)
    await tick()
    assert(
      strip.querySelector<HTMLElement>(".ruricon-preset-shortcut")!.getBoundingClientRect()
        .width === 100,
      "CSS variable updates button size",
    )
    assert(
      strip.querySelector<HTMLElement>(".ruricon-preset-thumbnail")!.getBoundingClientRect()
        .width === 100,
      "CSS variable updates thumbnail size",
    )
    assert(strip.scrollWidth <= strip.clientWidth, "Page capacity follows the CSS variable")
    shortcutRow.style.removeProperty("--ruricon-preset-shortcut-size")
  }
  click('[data-preset-id="900"]', strip)
  await tick()
  assert(
    reply.querySelector(".ruricon-preset-select")!.textContent!.includes("냥냥"),
    "Shortcut changes selected preset",
  )
  assert(
    strip.querySelector('[data-preset-id="900"]')?.getAttribute("aria-pressed") === "true",
    "Selected shortcut is marked",
  )
  assert(
    reply.querySelectorAll(".ruricon-icon-grid img").length === 96,
    "Shortcut reuses collection loading",
  )
  const presets = await loadPresets()
  assert(presets.length === 7, "M/S favorites collapse into one preset; ads retained")
  assert(presets.at(-2)?.id === 1917 && presets.at(-1)?.id === 3213, "Ad presets move to the end")
  assert(!presets.some((preset) => preset.id === 901), "Slave doesn't duplicate Main")
  const before = requests.length
  await Promise.all([loadCollection(presets[0]), loadCollection(presets[0])])
  assert(requests.length === before, "Shared cached requests")
  const slaveCollection = await loadCollection({
    id: 980,
    mainId: 980,
    title: "Slave URL test",
    thumbnail: { type: "image", src: source(980, 0) },
  })
  assert(
    slaveCollection.pages.map((page) => page.number).join(",") === "1,3" &&
      slaveCollection.pages[0].images.join(",") ===
        "https://example.com/shared.png?icon=981,https://example.com/other.png?size=large&icon=981#preview" &&
      slaveCollection.pages[1].images.join(",") === "https://example.com/shared.png?icon=982" &&
      slaveCollection.pages.every((page) => page.total === 3 && page.nextOffset === null),
    "Slave URLs use their article ID, deduplicate per page, preserve other URL parts and count published icons",
  )
  const beforeNewPage = requests.length
  await Promise.all([loadNativePage(960, 0), loadNativePage(960, 0)])
  assert(requests.length === beforeNewPage + 1, "Concurrent requests share one fetch")
  const deduplicated = await loadNativePage(970, 0)
  assert(
    deduplicated.images.join(",") ===
      [nativeSource(970, 0), `${nativeSource(970, 1)}?size=large#preview`].join(","),
    "Native URLs remove icon, preserve other parameters and fragments, and deduplicate in order",
  )
  assert(
    deduplicated.nextOffset === 100 && deduplicated.total === 205,
    "Deduplication preserves the server offset and total",
  )
  const nextPage = await loadNativePage(970, deduplicated.nextOffset)
  assert(
    nextPage.number === 2 && nextPage.nextOffset === 200 && nextPage.images.length === 2,
    "Next page uses the server offset independently of the unique image count",
  )
  const lastPage = await loadNativePage(970, nextPage.nextOffset)
  assert(
    lastPage.nextOffset === null && lastPage.total === 205,
    "Last page keeps server pagination",
  )
  await loadNativePage(5033, 200)
  await readIconImages(5033, 200)
  void act(cleanup)
  assert(!document.querySelector(".ruricon-icon-view, dialog"), "Unmount cleans views and dialog")
  click("button[onclick]", reply)
  assert(Number(nativeCalls) === 1, "Cleanup restores native button")
  const storedIcons = Array.from({ length: 1001 }, (_, index) => source(777, index))
  localStorage.setItem(
    "ruricon:icon-view:v1",
    JSON.stringify({
      presetId: 5033,
      favorites: [storedIcons[0], ...storedIcons],
      recent: [storedIcons[0], ...storedIcons],
    }),
  )
  const { mountCommentIconHook: mountLimits } = await import(
    new URL("../entrypoints/scripts/comment-icon.tsx?limits", import.meta.url).href
  )
  const cleanupLimits = mountLimits()
  click("button[onclick]", comment)
  await tick()
  enableEditMode(comment)
  const localPages = comment.querySelector<HTMLElement>(".ruricon-icon-pages")!
  for (const tabIndex of [2, 3]) {
    click(`.ruricon-icon-tabs button:nth-child(${tabIndex})`, comment)
    assert(
      comment.querySelectorAll(".ruricon-icon-grid img").length === 1000,
      "Local lists display all 1000 icons on one page",
    )
    const sources = [...comment.querySelectorAll<HTMLImageElement>(".ruricon-icon-grid img")].map(
      (image) => image.src,
    )
    assert(
      new Set(sources).size === 1000 && sources.at(-1) === storedIcons[999],
      "Stored duplicate URLs are removed before applying the local list limit",
    )
    assert(
      localPages.hidden &&
        getComputedStyle(localPages).display === "none" &&
        !localPages.children.length,
      "Local lists hide page selection",
    )
  }
  click(".ruricon-icon-insert", comment)
  await tick()
  click(".ruricon-icon-insert", comment)
  await tick()
  const reusedRecent = JSON.parse(localStorage.getItem("ruricon:icon-view:v1")!).recent
  assert(
    reusedRecent.length === 1000 &&
      new Set(reusedRecent).size === 1000 &&
      reusedRecent.filter((src: string) => src === storedIcons[0]).length === 1,
    "Reusing a recent icon keeps 1000 unique entries",
  )
  click(".ruricon-icon-tabs button:first-child", comment)
  assert(!localPages.hidden && localPages.children.length === 3, "All mode keeps native pages")
  click(".ruricon-icon-star", comment)
  assert(
    comment.querySelector('[role="status"]')!.textContent!.includes("1000") &&
      comment.querySelector(".ruricon-icon-star")!.getAttribute("aria-pressed") === "false",
    "Full favorites reject additions without evicting saved icons",
  )
  click(".ruricon-icon-insert", comment)
  await tick()
  const recent = JSON.parse(localStorage.getItem("ruricon:icon-view:v1")!).recent
  assert(
    recent.length === 1000 &&
      recent[0] === nativeSource(5033, 0) &&
      recent.at(-1) === source(777, 998),
    "New recent icon keeps the latest 1000 entries",
  )
  click(".ruricon-icon-tabs button:nth-child(2)", comment)
  const favoritesGrid = comment.querySelector<HTMLElement>(".ruricon-icon-grid")!
  favoritesGrid.scrollTop = 150
  const favoritesScrollTop = favoritesGrid.scrollTop
  click(".ruricon-icon-star", favoritesGrid)
  assert(
    favoritesGrid.children.length === 999 && favoritesGrid.scrollTop === favoritesScrollTop,
    "Removing a favorite preserves single-list scroll",
  )
  click(".ruricon-icon-tabs button:first-child", comment)
  click(".ruricon-icon-star", comment)
  const savedFavorites = JSON.parse(localStorage.getItem("ruricon:icon-view:v1")!).favorites
  assert(
    savedFavorites.length === 1000 &&
      new Set(savedFavorites).size === 1000 &&
      savedFavorites.filter(
        (src: string) =>
          src === comment.querySelector<HTMLImageElement>(".ruricon-icon-grid img")!.src,
      ).length === 1 &&
      comment.querySelector(".ruricon-icon-star")!.getAttribute("aria-pressed") === "true",
    "Favorite can be added after freeing a slot",
  )
  click(".ruricon-icon-star", comment)
  const nativeStars = comment.querySelectorAll<HTMLButtonElement>(".ruricon-icon-star")
  const repeatedFavoriteSrc = nativeStars[0]
    .closest(".ruricon-icon-tile")!
    .querySelector<HTMLImageElement>("img")!.src
  void act(() => {
    nativeStars[0].click()
    nativeStars[0].click()
    nativeStars[1].click()
  })
  const batchedFavorites = JSON.parse(localStorage.getItem("ruricon:icon-view:v1")!).favorites
  assert(
    batchedFavorites.length === 1000 &&
      batchedFavorites.filter((src: string) => src === repeatedFavoriteSrc).length === 1,
    "Repeated batched additions preserve the first favorite and cannot exceed the limit",
  )
  const storedBeforeUnmount = localStorage.getItem("ruricon:icon-view:v1")
  window.app.select_icon = async (image) => {
    void selectIcon(image)
    await new Promise<void>((resolve) => {
      releaseInsert = resolve
    })
  }
  click(".ruricon-icon-tile:nth-child(2) .ruricon-icon-insert", comment)
  assert(releaseInsert, "Native insertion is pending")
  void act(cleanupLimits)
  releaseInsert()
  await tick()
  window.app.select_icon = selectIcon
  assert(
    localStorage.getItem("ruricon:icon-view:v1") === storedBeforeUnmount &&
      !document.querySelector(".ruricon-icon-view, dialog"),
    "Unmount ignores late insertion completion",
  )
  const recentSet = [
    source(777, 0),
    source(902, 0),
    ...Array.from({ length: 11 }, (_, index) => source(901, index + 20)),
  ]
  localStorage.setItem(
    "ruricon:icon-view:v1",
    JSON.stringify({
      presetId: 900,
      favorites: [source(901, 25), source(901, 50)],
      recent: recentSet,
    }),
  )
  const { mountCommentIconHook: mountRecent } = await import(
    new URL("../entrypoints/scripts/comment-icon.tsx?recent", import.meta.url).href
  )
  const cleanupRecent = mountRecent()
  click("button[onclick]", comment)
  await tick()
  const recentGrid = comment.querySelector<HTMLElement>(".ruricon-icon-grid")!
  const recentSources = [...recentGrid.querySelectorAll<HTMLImageElement>("img")].map(
    (image) => image.src,
  )
  assert(
    recentSources.slice(0, 10).join(",") ===
      [25, 50, 20, 21, 22, 23, 24, 26, 27, 28].map((index) => source(901, index)).join(","),
    "Favorites precede the latest set recents in usage order",
  )
  assert(
    recentGrid.querySelectorAll('[data-recent="true"]').length === 9,
    "Ten recent markers are shared across set pages; unrelated history does not consume the cap",
  )
  const purpleButton = recentGrid.querySelector(
    '.ruricon-icon-tile[data-recent="true"][data-favorite="false"] .ruricon-icon-insert',
  )!
  assert(
    getComputedStyle(purpleButton).borderColor === "rgb(152, 97, 212)" &&
      getComputedStyle(purpleButton).borderWidth === "2px",
    "Recent icons have a purple border",
  )
  assert(
    getComputedStyle(
      recentGrid.querySelector(
        '.ruricon-icon-tile[data-recent="true"][data-favorite="true"] .ruricon-icon-insert',
      )!,
    ).borderColor === "rgb(233, 163, 35)",
    "Favorite border takes precedence over recent border",
  )
  click(".ruricon-icon-pages button:last-child", comment)
  assert(
    recentGrid.querySelectorAll('[data-recent="true"]').length === 1,
    "Other set page retains its newest recent marker",
  )
  click(".ruricon-icon-tabs button:nth-child(3)", comment)
  assert(
    [...recentGrid.querySelectorAll<HTMLImageElement>("img")]
      .map((image) => image.src)
      .join(",") === recentSet.join(",") && !recentGrid.querySelector('[data-recent="true"]'),
    "Recent tab keeps all history without the cap or purple markers",
  )
  const prioritizeRecent = comment.querySelector<HTMLButtonElement>(
    ".ruricon-icon-prioritize-recent",
  )!
  assert(
    !prioritizeRecent.hidden &&
      prioritizeRecent.getAttribute("aria-pressed") === "true" &&
      prioritizeRecent.querySelector("path")!.getAttribute("d") === "M20 6 9 17l-5-5",
    "Recent priority defaults on with the Lucide Check icon",
  )
  click(".ruricon-icon-prioritize-recent", comment)
  assert(
    prioritizeRecent.getAttribute("aria-pressed") === "false" &&
      prioritizeRecent.querySelectorAll("path").length === 2,
    "Recent priority off uses the Lucide X icon",
  )
  assert(
    JSON.parse(localStorage.getItem("ruricon:icon-view:v1")!).prioritizeRecent === false,
    "Recent priority setting is persisted",
  )
  assert(
    [...recentGrid.querySelectorAll<HTMLImageElement>("img")]
      .map((image) => image.src)
      .join(",") === recentSet.join(","),
    "Priority toggle preserves Recent tab order",
  )
  click(".ruricon-icon-tabs button:first-child", comment)
  assert(
    prioritizeRecent.hidden &&
      [...recentGrid.querySelectorAll<HTMLImageElement>("img")]
        .slice(0, 5)
        .map((image) => image.src)
        .join(",") === [25, 50, 0, 1, 2].map((index) => source(901, index)).join(","),
    "Priority off keeps favorites first and restores original order for other icons",
  )
  assert(
    recentGrid.querySelectorAll('[data-recent="true"]').length === 9,
    "Priority toggle preserves recent highlights and cap",
  )
  click(".ruricon-icon-tabs button:nth-child(2)", comment)
  assert(
    !recentGrid.querySelector('[data-recent="true"]'),
    "Favorite tab does not show recent markers",
  )
  const editButton = comment.querySelector<HTMLButtonElement>(".ruricon-icon-edit-mode")!
  assert(
    editButton.getAttribute("aria-pressed") === "false" &&
      editButton.querySelector("svg")!.getAttribute("fill") === "none",
    "Edit mode starts off with an empty star",
  )
  const storedBeforeEdit = localStorage.getItem("ruricon:icon-view:v1")
  click(".ruricon-icon-edit-mode", comment)
  assert(
    editButton.getAttribute("aria-pressed") === "true" &&
      editButton.querySelector("svg")!.getAttribute("fill") === "currentColor",
    "Edit mode on has a filled star",
  )
  for (const tabIndex of [1, 2, 3]) {
    click(`.ruricon-icon-tabs button:nth-child(${tabIndex})`, comment)
    assert(
      getComputedStyle(recentGrid.querySelector(".ruricon-icon-star")!).display !== "none",
      "Edit mode shows favorite controls in every tab",
    )
    assert(editButton.hidden === (tabIndex !== 2), "Edit toggle appears only in Favorites")
  }
  click(".ruricon-icon-tabs button:nth-child(2)", comment)
  click(".ruricon-icon-edit-mode", comment)
  assert(
    editButton.querySelector("svg")!.getAttribute("fill") === "none",
    "Turning edit mode off restores the empty star",
  )
  for (const tabIndex of [1, 2, 3]) {
    click(`.ruricon-icon-tabs button:nth-child(${tabIndex})`, comment)
    assert(
      getComputedStyle(recentGrid.querySelector(".ruricon-icon-star")!).display === "none",
      "Edit mode off hides favorite controls in every tab",
    )
  }
  assert(
    localStorage.getItem("ruricon:icon-view:v1") === storedBeforeEdit,
    "Editing mode does not modify saved icons or history",
  )
  const clearRecent = comment.querySelector<HTMLButtonElement>(".ruricon-icon-clear-recent")!
  assert(
    !clearRecent.hidden && !clearRecent.disabled && clearRecent.querySelector("svg"),
    "Recent tab has a Lucide history delete button",
  )
  const savedBeforeClear = JSON.parse(localStorage.getItem("ruricon:icon-view:v1")!)
  click(".ruricon-icon-clear-recent", comment)
  const savedAfterClear = JSON.parse(localStorage.getItem("ruricon:icon-view:v1")!)
  assert(
    !savedAfterClear.recent.length &&
      JSON.stringify({ ...savedAfterClear, recent: savedBeforeClear.recent }) ===
        JSON.stringify(savedBeforeClear),
    "Deleting history persists an empty list and preserves other preferences",
  )
  assert(
    !recentGrid.querySelector("img") && clearRecent.disabled,
    "Cleared recent tab is empty and delete is disabled",
  )
  click(".ruricon-icon-tabs button:first-child", comment)
  assert(
    clearRecent.hidden && !recentGrid.querySelector('[data-recent="true"]'),
    "Delete is hidden in All and recent highlights are removed",
  )
  click(".ruricon-icon-tabs button:nth-child(2)", comment)
  assert(
    clearRecent.hidden && recentGrid.querySelectorAll("img").length === 2,
    "Favorites are preserved and delete is hidden in Favorites",
  )
  enableEditMode(comment)
  assert(
    JSON.parse(localStorage.getItem("ruricon:icon-view:v1")!).editMode === true,
    "Edit mode on is persisted",
  )
  void act(cleanupRecent)
  for (const enabled of [true, false]) {
    const cleanupReload = mountRecent()
    click("button[onclick]", comment)
    await tick()
    click(".ruricon-icon-tabs button:nth-child(3)", comment)
    const restoredPriority = comment.querySelector<HTMLButtonElement>(
      ".ruricon-icon-prioritize-recent",
    )!
    assert(
      restoredPriority.getAttribute("aria-pressed") === String(!enabled),
      "Reload restores recent priority ON and OFF",
    )
    if (enabled) click(".ruricon-icon-prioritize-recent", comment)
    click(".ruricon-icon-tabs button:nth-child(2)", comment)
    const restoredButton = comment.querySelector<HTMLButtonElement>(".ruricon-icon-edit-mode")!
    assert(
      restoredButton.getAttribute("aria-pressed") === String(enabled) &&
        restoredButton.querySelector("svg")!.getAttribute("fill") ===
          (enabled ? "currentColor" : "none"),
      "Reload restores persisted edit mode and star",
    )
    assert(
      (getComputedStyle(comment.querySelector(".ruricon-icon-star")!).display !== "none") ===
        enabled,
      "Reload restores favorite button visibility",
    )
    if (enabled) {
      click(".ruricon-icon-edit-mode", comment)
      assert(
        JSON.parse(localStorage.getItem("ruricon:icon-view:v1")!).editMode === false,
        "Edit mode off is persisted",
      )
    }
    void act(cleanupReload)
  }
  localStorage.setItem(
    "ruricon:icon-view:v1",
    JSON.stringify({
      presetId: 5033,
      favorites: [],
      recent: [],
      editMode: false,
      prioritizeRecent: true,
    }),
  )
  const cleanupScroll = mountRecent()
  click("button[onclick]", comment)
  await tick()
  enableEditMode(comment)
  const insertGrid = comment.querySelector<HTMLElement>(".ruricon-icon-grid")!
  const lowerImage = insertGrid.querySelectorAll<HTMLImageElement>("img")[40]
  const lowerTile = lowerImage.closest<HTMLElement>(".ruricon-icon-tile")!
  lowerTile.querySelector<HTMLButtonElement>(".ruricon-icon-insert")!.focus()
  const insertScrollTop = insertGrid.scrollTop
  assert(
    insertScrollTop > 0,
    "Recent insertion regression starts with a focused icon in a scrolled grid",
  )
  click(".ruricon-icon-insert", lowerTile)
  await tick()
  assert(
    insertGrid.querySelector("img") === lowerImage,
    "Inserted icon moves first without recreating its DOM",
  )
  assert(
    insertGrid.scrollTop === insertScrollTop,
    `Recent priority preserves grid scroll when the clicked icon moves first (${insertScrollTop} -> ${insertGrid.scrollTop}; focus=${document.activeElement?.className})`,
  )
  assert(
    document.activeElement === lowerTile.querySelector(".ruricon-icon-insert"),
    "Recent reordering preserves keyboard focus without scrolling",
  )
  click(".ruricon-icon-tabs button:first-child", comment)
  assert(
    insertGrid.scrollTop === insertScrollTop,
    "Selecting the current tab does not reset scroll",
  )
  const lowerFavoriteTile = insertGrid.querySelectorAll<HTMLElement>(".ruricon-icon-tile")[70]
  const lowerFavoriteImage = lowerFavoriteTile.querySelector("img")!
  const lowerFavoriteButton =
    lowerFavoriteTile.querySelector<HTMLButtonElement>(".ruricon-icon-star")!
  lowerFavoriteButton.focus()
  const favoriteReorderScroll = insertGrid.scrollTop
  assert(
    favoriteReorderScroll > 0,
    "Favorite reorder starts with a focused star in a scrolled grid",
  )
  for (const pressed of ["true", "false"]) {
    click(".ruricon-icon-star", lowerFavoriteTile)
    await tick()
    assert(
      lowerFavoriteButton.getAttribute("aria-pressed") === pressed,
      "Favorite addition and removal update the same button",
    )
    if (pressed === "true")
      assert(
        insertGrid.querySelector("img") === lowerFavoriteImage,
        "Favorite addition moves the icon first",
      )
    assert(
      insertGrid.scrollTop === favoriteReorderScroll,
      "Favorite reordering preserves scroll without resetting to top",
    )
    assert(
      document.activeElement === lowerFavoriteButton,
      "Favorite reordering preserves keyboard focus",
    )
  }
  click(".ruricon-icon-tabs button:nth-child(3)", comment)
  assert(insertGrid.scrollTop === 0, "Changing tabs resets scroll")
  click(".ruricon-icon-tabs button:first-child", comment)
  insertGrid.querySelectorAll<HTMLButtonElement>(".ruricon-icon-insert")[80].focus()
  assert(insertGrid.scrollTop > 0, "Page change starts from a scrolled grid")
  click(".ruricon-icon-pages button:nth-child(2)", comment)
  assert(insertGrid.scrollTop === 0, "Changing pages resets scroll")
  await tick()
  const orderTiles = [...insertGrid.querySelectorAll<HTMLElement>(".ruricon-icon-tile")].slice(0, 2)
  const orderSources = orderTiles.map((tile) => tile.querySelector<HTMLImageElement>("img")!.src)
  assert(orderTiles.length === 2, "Favorite order regression starts with two loaded icons")
  for (const tile of orderTiles) click(".ruricon-icon-star", tile)
  const beforeMove = JSON.parse(localStorage.getItem("ruricon:icon-view:v1")!)
  assert(
    beforeMove.favorites.join(",") === [...orderSources].reverse().join(","),
    "New favorites are inserted at the beginning",
  )
  assert(
    !insertGrid.querySelector(".ruricon-icon-move-first"),
    "All tab does not show reorder controls",
  )
  click(".ruricon-icon-tabs button:nth-child(2)", comment)
  const moveButtons = insertGrid.querySelectorAll<HTMLButtonElement>(".ruricon-icon-move-first")
  assert(
    moveButtons.length === 2 && moveButtons[0].disabled && !moveButtons[1].disabled,
    "Edit mode shows reorder controls only for Favorites; first is disabled",
  )
  assert(
    getComputedStyle(moveButtons[1]).position === "absolute" &&
      moveButtons[1].getBoundingClientRect().left <
        moveButtons[1].closest(".ruricon-icon-tile")!.getBoundingClientRect().left + 10,
    "Move-to-front button overlays the bottom left",
  )
  moveButtons[1].focus()
  click(".ruricon-icon-move-first", moveButtons[1].closest(".ruricon-icon-tile")!)
  const afterMove = JSON.parse(localStorage.getItem("ruricon:icon-view:v1")!)
  assert(
    afterMove.favorites.join(",") === orderSources.join(",") &&
      JSON.stringify({ ...afterMove, favorites: beforeMove.favorites }) ===
        JSON.stringify(beforeMove),
    "Move-to-front persists order without duplicates or changing other preferences",
  )
  assert(
    insertGrid.querySelector<HTMLImageElement>("img")!.src === orderSources[0] &&
      moveButtons[1].disabled,
    "Moved icon becomes index zero",
  )
  assert(
    document.activeElement ===
      moveButtons[1].closest(".ruricon-icon-tile")!.querySelector(".ruricon-icon-insert"),
    "Disabled reorder control transfers focus to its icon without scrolling",
  )
  void act(cleanupScroll)
  const cleanupOrderReload = mountRecent()
  click("button[onclick]", comment)
  await tick()
  click(".ruricon-icon-tabs button:nth-child(2)", comment)
  const orderGrid = comment.querySelector<HTMLElement>(".ruricon-icon-grid")!
  assert(
    [...orderGrid.querySelectorAll<HTMLImageElement>("img")].map((image) => image.src).join(",") ===
      orderSources.join(","),
    "Reload restores favorite order",
  )
  click(".ruricon-icon-edit-mode", comment)
  assert(
    !orderGrid.querySelector(".ruricon-icon-move-first"),
    "Edit mode off hides reorder buttons",
  )
  click(".ruricon-icon-edit-mode", comment)
  click(".ruricon-icon-tabs button:nth-child(3)", comment)
  assert(
    !orderGrid.querySelector(".ruricon-icon-move-first"),
    "Recent tab does not show reorder buttons",
  )
  const actions = ["edit-mode", "clear-recent", "prioritize-recent"].map((name) =>
    comment.querySelector<HTMLButtonElement>(`.ruricon-icon-${name}`)!,
  )
  assert(
    actions.every((button) => button.classList.contains("ruricon-icon-action")),
    "Toolbar actions keep individual classes and share the common class",
  )
  for (const tabIndex of [1, 2, 3]) {
    click(`.ruricon-icon-tabs button:nth-child(${tabIndex})`, comment)
    for (const [index, button] of actions.entries()) {
      const style = getComputedStyle(button)
      const shown = index === 0 ? tabIndex === 2 : tabIndex === 3
      assert(
        style.display === (shown ? "flex" : "none"),
        "Every action follows its tab visibility even outside the tabs container",
      )
      assert(
        style.minHeight === "36px" && style.gap === "6px" && style.padding === "0px 12px",
        "Every action uses unified sizing and spacing",
      )
    }
  }
  const actionGroup = comment.querySelector<HTMLElement>(".ruricon-icon-actions")!
  const actionToolbar = comment.querySelector<HTMLElement>(".ruricon-icon-toolbar")!
  const previousActionWidth = comment.style.maxWidth
  for (const width of ["720px", "280px"]) {
    comment.style.maxWidth = width
    const clearBounds = actions[1].getBoundingClientRect()
    const priorityBounds = actions[2].getBoundingClientRect()
    assert(
      Math.abs(
        actionGroup.getBoundingClientRect().right - actionToolbar.getBoundingClientRect().right,
      ) < 1,
      "Action group stays right aligned on wide and narrow layouts",
    )
    assert(
      clearBounds.top === priorityBounds.top &&
        Math.abs(priorityBounds.left - clearBounds.right - 8) < 1,
      "Delete and priority stay together with an 8px gap",
    )
  }
  comment.style.maxWidth = previousActionWidth
  const beforeActionClear = JSON.parse(localStorage.getItem("ruricon:icon-view:v1")!)
  assert(
    beforeActionClear.recent.length > 0 && !actions[1].disabled,
    "History deletion starts enabled with saved history",
  )
  assert(
    getComputedStyle(actions[1]).color === "rgb(255, 56, 60)" &&
      getComputedStyle(actions[1]).borderColor === "rgb(255, 56, 60)",
    "History delete is highlighted in the requested red",
  )
  confirmDeletion = false
  click(".ruricon-icon-clear-recent", comment)
  assert(
    JSON.stringify(JSON.parse(localStorage.getItem("ruricon:icon-view:v1")!)) ===
      JSON.stringify(beforeActionClear) &&
      !actions[1].disabled &&
      orderGrid.querySelector("img"),
    "Canceling history confirmation preserves saved data and the recent list",
  )
  assert(
    deletionPrompts.at(-1) === "최근 사용 기록을 모두 삭제하시겠습니까?",
    "History delete asks for confirmation",
  )
  confirmDeletion = true
  click(".ruricon-icon-clear-recent", comment)
  const afterActionClear = JSON.parse(localStorage.getItem("ruricon:icon-view:v1")!)
  assert(
    !afterActionClear.recent.length &&
      JSON.stringify({ ...afterActionClear, recent: beforeActionClear.recent }) ===
        JSON.stringify(beforeActionClear),
    "Shared-style delete button clears only saved recent history",
  )
  assert(
    actions[1].disabled && !orderGrid.querySelector("img"),
    "Cleared history disables the delete button and empties the recent grid",
  )
  click(".ruricon-icon-tabs button:first-child", comment)
  click('.ruricon-icon-star[aria-pressed="false"]', orderGrid)
  click(".ruricon-icon-tabs button:nth-child(2)", comment)
  const selectedDelete = () =>
    comment.querySelector<HTMLButtonElement>(".ruricon-icon-delete-selected")!
  const selectionImages = [...orderGrid.querySelectorAll<HTMLImageElement>("img")].slice(0, 2)
  const selectionButtons = selectionImages.map((image) =>
    image.closest(".ruricon-icon-tile")!.querySelector<HTMLButtonElement>(".ruricon-icon-insert")!,
  )
  const beforeSelection = localStorage.getItem("ruricon:icon-view:v1")
  const nativeSelectionInsert = window.app.select_icon
  let selectionInsertCalls = 0
  window.app.select_icon = (image) => {
    selectionInsertCalls++
    return nativeSelectionInsert(image)
  }
  assert(
    selectedDelete().disabled && selectedDelete().textContent!.includes("0개 삭제"),
    "Selection mode starts empty",
  )
  assert(
    !orderGrid.contains(selectedDelete()) &&
      orderGrid.nextElementSibling?.contains(selectedDelete()),
    "Bulk delete lives in a separate DOM below the grid",
  )
  const selectFavorite = (index: number) => {
    const image = [...orderGrid.querySelectorAll<HTMLImageElement>("img")].find(
      (item) => item.src === selectionImages[index].src,
    )!
    return click(".ruricon-icon-insert", image.closest(".ruricon-icon-tile")!)
  }
  const selectAll = comment.querySelector<HTMLButtonElement>(".ruricon-icon-select-all")!
  assert(
    selectAll.nextElementSibling === selectedDelete(),
    "Select-all sits immediately left of delete",
  )
  click(".ruricon-icon-select-all", comment)
  assert(
    orderGrid.querySelectorAll('.ruricon-icon-insert[aria-pressed="true"]').length === 3 &&
      selectedDelete().textContent!.includes("3개 삭제"),
    "Select-all selects every favorite",
  )
  click(".ruricon-icon-select-all", comment)
  assert(
    orderGrid.querySelectorAll('.ruricon-icon-insert[aria-pressed="true"]').length === 3 &&
      localStorage.getItem("ruricon:icon-view:v1") === beforeSelection &&
      selectionInsertCalls === 0,
    "Select-all is idempotent and does not insert or persist selection",
  )
  for (const tile of orderGrid.querySelectorAll<HTMLElement>(".ruricon-icon-tile"))
    click(".ruricon-icon-insert", tile)
  selectFavorite(0)
  selectFavorite(1)
  assert(
    selectionButtons.every((button) => button.getAttribute("aria-pressed") === "true") &&
      selectedDelete().textContent!.includes("2개 삭제"),
    "Favorite edit mode supports multiple selected icons",
  )
  selectFavorite(0)
  assert(
    selectionButtons[0].getAttribute("aria-pressed") === "false" &&
      selectedDelete().textContent!.includes("1개 삭제"),
    "Clicking a selected icon deselects it",
  )
  selectFavorite(0)
  assert(
    selectionInsertCalls === 0 && localStorage.getItem("ruricon:icon-view:v1") === beforeSelection,
    "Selecting icons neither inserts nor modifies saved preferences",
  )
  click(".ruricon-icon-tabs button:first-child", comment)
  assert(
    !comment.querySelector(".ruricon-icon-delete-selected"),
    "Leaving Favorites hides selection actions",
  )
  click(".ruricon-icon-tabs button:nth-child(2)", comment)
  assert(selectedDelete().disabled, "Returning to Favorites clears selection")
  selectFavorite(0)
  click("button[onclick]", comment)
  click("button[onclick]", comment)
  assert(
    selectedDelete().disabled && localStorage.getItem("ruricon:icon-view:v1") === beforeSelection,
    "Closing and reopening a view clears selection without changing saved state",
  )
  selectFavorite(0)
  click(".ruricon-icon-edit-mode", comment)
  assert(
    !comment.querySelector(".ruricon-icon-delete-selected"),
    "Turning edit mode off leaves selection mode",
  )
  selectFavorite(0)
  await tick()
  assert(Number(selectionInsertCalls) === 1, "Favorite icons insert normally when edit mode is off")
  click(".ruricon-icon-edit-mode", comment)
  assert(selectedDelete().disabled, "Turning edit mode back on starts with no selection")
  selectFavorite(0)
  selectFavorite(1)
  const beforeBulkDelete = JSON.parse(localStorage.getItem("ruricon:icon-view:v1")!)
  assert(
    getComputedStyle(selectedDelete()).color === "rgb(255, 56, 60)" &&
      getComputedStyle(selectedDelete()).borderColor === "rgb(255, 56, 60)",
    "Selected delete uses the same requested red",
  )
  confirmDeletion = false
  click(".ruricon-icon-delete-selected", comment)
  assert(
    JSON.stringify(JSON.parse(localStorage.getItem("ruricon:icon-view:v1")!)) ===
      JSON.stringify(beforeBulkDelete) &&
      orderGrid.querySelectorAll('.ruricon-icon-insert[aria-pressed="true"]').length === 2 &&
      selectedDelete().textContent!.includes("2개 삭제"),
    "Canceling selected deletion preserves data and selection",
  )
  assert(
    deletionPrompts.at(-1) === "선택한 즐겨찾기 2개를 삭제하시겠습니까?",
    "Selected deletion confirms the selected count",
  )
  confirmDeletion = true
  click(".ruricon-icon-delete-selected", comment)
  const afterBulkDelete = JSON.parse(localStorage.getItem("ruricon:icon-view:v1")!)
  assert(
    afterBulkDelete.favorites.join(",") === beforeBulkDelete.favorites.slice(2).join(",") &&
      JSON.stringify({ ...afterBulkDelete, favorites: beforeBulkDelete.favorites }) ===
        JSON.stringify(beforeBulkDelete),
    "Bulk delete removes only selected favorites and preserves history and settings",
  )
  assert(
    orderGrid.querySelectorAll("img").length === 1 && selectedDelete().disabled,
    "Bulk delete resets selection and preserves the unselected icon",
  )
  click(".ruricon-icon-insert", orderGrid)
  click(".ruricon-icon-delete-selected", comment)
  assert(
    !orderGrid.querySelector("img") && selectedDelete().disabled,
    "Deleting the last selected favorite shows an empty list",
  )
  assert(
    comment.querySelector<HTMLButtonElement>(".ruricon-icon-select-all")!.disabled,
    "Empty favorites disable select-all",
  )
  window.app.select_icon = nativeSelectionInsert
  void act(cleanupOrderReload)
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
    window.confirm = originalConfirm
  })
