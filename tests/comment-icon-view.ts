import { compileMain } from "../entrypoints/lib/editor/articleMeta.ts"
import { loadCollection, loadNativePage, loadPresets } from "../entrypoints/lib/icon-view.ts"
import { getLastId, readIconImages } from "../entrypoints/lib/ruli-utils.ts"
import { mountCommentIconHook } from "../entrypoints/scripts/comment-icon.tsx"

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message)
}
const requests: string[] = []
const source = (id: number, index: number) =>
  `https://example.com/${id}/${index}.${id === 5033 && index === 1 ? "mp4" : "png"}?icon=${id}`
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
const waitFor = async (predicate: () => boolean) => {
  for (let attempt = 0; attempt < 100 && !predicate(); attempt++)
    await new Promise((resolve) => setTimeout(resolve, 10))
  assert(predicate(), "Layout update completed")
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
  const selectedThumbnail = comment.querySelector<HTMLImageElement>(
    ".ruricon-preset-select > .ruricon-preset-thumbnail",
  )!
  assert(
    selectedThumbnail.src === source(900, 0),
    "Preset selector uses Main thumbnail on the left",
  )
  assert(
    comment.querySelector<HTMLElement>(".ruricon-icon-insert")!.getBoundingClientRect().width ===
      100,
    "Grid icon size is 100px",
  )
  const numbers = [...comment.querySelectorAll(".ruricon-icon-pages button")].map(
    (button) => button.textContent,
  )
  assert(numbers.join(",") === "1,3", "Segment page numbers and order")
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
  assert(existingVideo?.src === source(5033, 1), "Video keeps the original URL")
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
    comment.querySelector<HTMLImageElement>(".icon_preview")?.src === source(5033, 1),
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
  click(".ruricon-icon-pages button:last-child", comment)
  await tick()
  assert(comment.querySelectorAll(".ruricon-icon-grid img").length === 5, "Last partial fetch page")
  click(".ruricon-icon-pages button:first-child", comment)
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
  const presetRow = modal.querySelector<HTMLButtonElement>(".ruricon-preset-list button")!
  assert(
    presetRow.firstElementChild?.classList.contains("ruricon-preset-thumbnail"),
    "Preset row thumbnail precedes label",
  )
  assert(getComputedStyle(presetRow).display === "flex", "Preset thumbnail and label share a row")
  assert(document.activeElement === modal.querySelector("input"), "Search receives focus")
  const hangulSearch = modal.querySelector<HTMLInputElement>("input")!
  for (const query of ["냐", "ㄴㄴ"]) {
    hangulSearch.value = query
    hangulSearch.dispatchEvent(new Event("input"))
    assert(
      modal.querySelectorAll(".ruricon-preset-list button").length === 1,
      "Hangul composition and choseong filter preset rows",
    )
    assert(
      modal.querySelector(".ruricon-preset-list button")!.textContent!.includes("냥냥"),
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
  const shortcutRow = reply.querySelector<HTMLElement>(".ruricon-preset-shortcuts")!
  const strip = shortcutRow.querySelector<HTMLElement>(".ruricon-preset-strip")!
  const shortcut = strip.querySelector<HTMLElement>(".ruricon-preset-shortcut")!
  const thumbnail = shortcut.querySelector<HTMLElement>(".ruricon-preset-thumbnail")!
  assert(
    shortcut.getBoundingClientRect().width === 80 && shortcut.getBoundingClientRect().height === 80,
    "Shortcut button uses shared 80px size",
  )
  assert(
    thumbnail.getBoundingClientRect().width === 80 &&
      thumbnail.getBoundingClientRect().height === 80,
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
    assert(strip.children.length === 5, "Mobile shows all shortcuts in one strip")
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
    arrows[0].click()
    assert(arrows[0].disabled && !arrows[1].disabled, "Desktop first page has only next enabled")
    assert(strip.scrollWidth <= strip.clientWidth, "Desktop fits whole thumbnails in one row")
    const firstId = strip.firstElementChild?.getAttribute("data-preset-id")
    const beforePaging = requests.length
    arrows[1].click()
    assert(
      strip.firstElementChild?.getAttribute("data-preset-id") !== firstId,
      "Desktop arrows change thumbnail page",
    )
    assert(requests.length === beforePaging, "Shortcut paging doesn't fetch collections")
    while (!arrows[1].disabled) arrows[1].click()
    assert(arrows[1].disabled, "Last shortcut page disables next")
    ;(reply as HTMLElement).style.maxWidth = "240px"
    arrows[0].click()
    assert(strip.children.length === 1, "Narrow desktop page fits one 80px thumbnail")
    assert(strip.scrollWidth <= strip.clientWidth, "Resize recomputes desktop page capacity")
    while (!arrows[0].disabled) arrows[0].click()
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
  const storedIcons = Array.from({ length: 1001 }, (_, index) => source(777, index))
  localStorage.setItem(
    "ruricon:icon-view:v1",
    JSON.stringify({ presetId: 5033, favorites: storedIcons, recent: storedIcons }),
  )
  const { mountCommentIconHook: mountLimits } = await import(
    new URL("../entrypoints/scripts/comment-icon.tsx?limits", import.meta.url).href
  )
  const cleanupLimits = mountLimits()
  click("button[onclick]", comment)
  await tick()
  const localPages = comment.querySelector<HTMLElement>(".ruricon-icon-pages")!
  for (const tabIndex of [2, 3]) {
    click(`.ruricon-icon-tabs button:nth-child(${tabIndex})`, comment)
    assert(
      comment.querySelectorAll(".ruricon-icon-grid img").length === 1000,
      "Local lists display all 1000 icons on one page",
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
  assert(
    JSON.parse(localStorage.getItem("ruricon:icon-view:v1")!).recent.length === 1000,
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
    recent.length === 1000 && recent[0] === source(5033, 0) && recent.at(-1) === source(777, 998),
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
  assert(
    JSON.parse(localStorage.getItem("ruricon:icon-view:v1")!).favorites.length === 1000 &&
      comment.querySelector(".ruricon-icon-star")!.getAttribute("aria-pressed") === "true",
    "Favorite can be added after freeing a slot",
  )
  cleanupLimits()
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
