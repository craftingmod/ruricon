import { openRuriconIconView } from "../entrypoints/scripts/comment-icon.tsx"

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message)
}
const result = document.querySelector<HTMLElement>("#result")!
const storageKey = "ruricon:icon-view:v1"
const originalSaved = localStorage.getItem(storageKey)
const originalFetch = window.fetch
const originalConfirm = window.confirm
const sources = Array.from(
  { length: 1000 },
  (_, index) => `https://example.com/virtual-${index}.png`,
)
localStorage.setItem(
  storageKey,
  JSON.stringify({
    presetId: null,
    favorites: sources,
    recent: [...sources].reverse(),
    editMode: true,
    prioritizeRecent: true,
  }),
)
window.fetch = async () => Response.json({ success: true, html: "" })
window.confirm = () => true
const container = document.querySelector<HTMLElement>(".comment_icon")!
const waitFor = async (predicate: () => boolean, message: string) => {
  for (let attempt = 0; attempt < 200 && !predicate(); attempt++)
    await new Promise((resolve) => setTimeout(resolve, 10))
  assert(predicate(), message)
}
const click = (selector: string) => {
  const button = container.querySelector<HTMLButtonElement>(selector)
  assert(button, `Missing ${selector}`)
  button.click()
}
const firstSource = () => container.querySelector<HTMLImageElement>(".ruricon-icon-tile img")?.src
const saved = () => JSON.parse(localStorage.getItem(storageKey)!)

async function check() {
  openRuriconIconView(container, false, "favorites")
  await waitFor(() => firstSource() === sources[0], "Favorites preserve saved order")
  const grid = container.querySelector<HTMLElement>(".ruricon-icon-grid")!
  const scroller = () => grid.querySelector<HTMLElement>('[data-virtuoso-scroller="true"]')!
  const tiles = () => [...grid.querySelectorAll<HTMLElement>(".ruricon-icon-tile")]
  assert(scroller(), "Favorites use Virtuoso")
  assert(tiles().length > 0 && tiles().length < 1000, "Favorites render only a window")
  tiles()[1].querySelector<HTMLButtonElement>(".ruricon-icon-move-first")!.click()
  await waitFor(() => firstSource() === sources[1], "Move to front updates the virtual grid")
  scroller().scrollTo({ top: 2500 })
  await waitFor(
    () => tiles()[0]?.querySelector<HTMLImageElement>("img")?.src !== sources[1],
    "Scrolling renders later favorites",
  )
  const selectedSource = tiles()[0].querySelector<HTMLImageElement>("img")!.src
  tiles()[0].querySelector<HTMLButtonElement>(".ruricon-icon-insert")!.click()
  await waitFor(() => !!grid.querySelector(".ruricon-icon-selected"), "Scrolled icon is selected")
  const scrollTop = scroller().scrollTop
  scroller().scrollTo({ top: 0 })
  await waitFor(() => firstSource() === sources[1], "Scroll back renders the first favorite")
  scroller().scrollTo({ top: scrollTop })
  await waitFor(() => !!grid.querySelector(".ruricon-icon-selected"), "Selection survives unmount")
  click(".ruricon-icon-delete-selected")
  await waitFor(
    () => !saved().favorites.includes(selectedSource),
    "Bulk delete removes selected URL",
  )
  assert(saved().recent.length === 1000, "Favorite deletion preserves history")
  click('.ruricon-icon-tabs [aria-label="최근 사용"]')
  await waitFor(() => firstSource() === sources[999], "Recent preserves newest-first order")
  assert(scroller() && tiles().length < 1000, "Recent uses a virtual window")
  assert(scroller().scrollTop === 0, "Changing tabs resets virtual scroll")
  assert(!grid.querySelector(".ruricon-icon-move-first"), "Recent has no favorite reorder controls")
  scroller().scrollTo({ top: 2500 })
  await waitFor(() => firstSource() !== sources[999], "Recent scroll renders later history")
  click(".ruricon-icon-clear-recent")
  await waitFor(
    () => !!grid.querySelector(".ruricon-icon-empty"),
    "Empty history shows its message",
  )
  assert(!scroller(), "Empty history does not hide the message behind a virtual viewport")
  assert(saved().favorites.length === 999, "Clearing history preserves favorites")
  result.textContent =
    "PASS: 1000 Favorite/Recent icons, virtual scrolling, reorder, selection, deletion, empty state"
}

void check()
  .catch((error) => {
    result.textContent = `FAIL: ${error instanceof Error ? error.message : error}`
    console.error(error)
  })
  .finally(() => {
    window.fetch = originalFetch
    window.confirm = originalConfirm
    if (originalSaved === null) localStorage.removeItem(storageKey)
    else localStorage.setItem(storageKey, originalSaved)
  })
