import { compileMain, type IconSetState } from "../entrypoints/lib/editor/articleMeta.ts"
import { iconCacheTTL, readIconCache } from "../entrypoints/lib/icon-cache.ts"
import { loadAllIconImages, loadCollection, loadNativePage } from "../entrypoints/lib/icon-view.ts"

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message)
}

const result = document.querySelector<HTMLElement>("#result")!
const grid = document.querySelector<HTMLElement>("#grid")!
const preset = {
  id: 123,
  mainId: null,
  title: "Cache",
  thumbnail: { type: "image" as const, src: "" },
}
const originalFetch = window.fetch
const originalNow = Date.now
const started = originalNow()
let now = started
Date.now = () => now
let masterRequests = 0
let masterName = "Master"
let holdMaster = false
let failMaster = false
let version = "old"
let fail = false
let release: (() => void) | undefined
let hold = false
const calls: number[] = []
const apply = (images: string[]) => {
  grid.textContent = images.join(" ")
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 100))
window.fetch = async (input) => {
  const url = new URL(
    input instanceof Request ? input.url : input instanceof URL ? input.href : input,
  )
  if (url.hostname !== "api.ruliweb.com") {
    masterRequests++
    if (holdMaster) {
      holdMaster = false
      await new Promise<void>((resolve) => {
        release = resolve
      })
    }
    if (failMaster) return new Response("failed", { status: 503 })
    const content = compileMain("", {
      version: 1,
      name: masterName,
      boardId: 98,
      mainArticleId: 900,
      slaves: [
        { page: 2, articleId: 124, images: [] },
        { page: 1, articleId: 123, images: [] },
      ],
    })
    return new Response(
      `<div class="board_main"><div class="board_main_view"><div class="view_content"><article><div>${content}</div></article></div></div></div>`,
    )
  }
  const offset = Number(url.searchParams.get("offset"))
  calls.push(offset)
  if (hold) {
    hold = false
    await new Promise<void>((resolve) => {
      release = resolve
    })
  }
  if (fail && offset === 7) return new Response("failed", { status: 503 })
  const src = `https://example.com/${version}-${offset}.png?icon=123`
  return Response.json({
    success: true,
    has_more: offset === 0,
    next_offset: offset === 0 ? 7 : 0,
    total_count: 3,
    html: `<div><a>Cache</a><span onclick="app.icon_data_show(this, 123)"></span></div><div class="select_icon_box"><img src="${src}">${offset === 0 ? `<img src="${src}">` : ""}</div>`,
  })
}

try {
  // Each run uses a clean database, including when Chrome reuses the test profile.
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase("ruricon:icon-cache")
    request.onsuccess = () => resolve()
    request.onerror = request.onblocked = () => reject(new Error("Database cleanup failed"))
  })
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open("ruricon:icon-cache", 1)
    request.onupgradeneeded = () => request.result.createObjectStore("responses")
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const db = request.result
      const transaction = db.transaction("responses", "readwrite")
      const store = transaction.objectStore("responses")
      store.put({ updatedAt: now, value: { images: ["legacy"], pages: [] } }, "icon:123")
      store.put({ updatedAt: now, value: { mainArticleId: 900, slaves: {} } }, "main:98:900")
      transaction.oncomplete = () => {
        db.close()
        resolve()
      }
      transaction.onerror = () => reject(transaction.error)
    }
  })
  await settle()
  const old = await loadAllIconImages(preset)
  assert(old.length === 3 && old[0] === old[1], "Raw order and duplicates survive")
  assert(calls.join() === "0,7", "All server pages fetched for one iconId")
  const cached = await readIconCache<string[]>("icon:123")
  assert(cached?.value.join() === old.join(), "One iconId record contains the entire array")
  assert((await readIconCache("native:123:0:100")) === undefined, "No page cache record")
  now = started + iconCacheTTL - 1
  await loadAllIconImages(preset)
  await loadNativePage(123, 7)
  assert(calls.length === 2, "Fresh cache shared by full view and page view")

  now = cached!.updatedAt + iconCacheTTL
  version = "new"
  hold = true
  const refresh = loadAllIconImages(preset, (images) => apply(images))
  await settle()
  assert(grid.textContent?.includes("old-0"), "Previous data is published before fetch completes")
  const concurrent = loadAllIconImages(preset)
  await settle()
  release!()
  const fresh = await refresh
  apply(fresh)
  await concurrent
  await settle()
  assert(
    grid.textContent?.includes("new-0") && !grid.textContent?.includes("old-0"),
    "Data updates after fetch",
  )
  assert(calls.join() === "0,7,0,7", "Concurrent expired reads share one full refresh")
  const updated = await readIconCache<string[]>("icon:123")
  assert(updated?.value.join() === fresh.join(), "Whole record replaced after success")

  now += iconCacheTTL
  fail = true
  let previous: string[] = []
  let rejected = false
  try {
    await loadAllIconImages(preset, (images) => {
      previous = images
    })
  } catch {
    rejected = true
  }
  assert(rejected && previous.join() === fresh.join(), "Failed refresh retains previous source")
  const retained = await readIconCache<string[]>("icon:123")
  assert(
    retained?.updatedAt === updated?.updatedAt && retained?.value.join() === fresh.join(),
    "Partial fetch does not overwrite record or extend TTL",
  )
  fail = false
  await loadAllIconImages(preset)
  assert(calls.join() === "0,7,0,7,0,7,0,7", "Failed request can be retried")
  const masterImages = await loadAllIconImages({ ...preset, id: 900, mainId: 900 })
  assert(
    masterImages.length === 6,
    "Master and Slave recover from malformed metadata and legacy image-object records",
  )
  assert(
    Array.isArray((await readIconCache("icon:124"))?.value),
    "Each Slave is stored as an image array",
  )
  const masterPreset = { ...preset, id: 900, mainId: 900 }
  const metadata = await readIconCache<IconSetState>("main:98:900")
  assert(
    metadata?.value.name === "Master" &&
      metadata.value.version === 1 &&
      metadata.value.boardId === 98 &&
      metadata.value.slaves.map((slave) => slave.articleId).join() === "124,123",
    "Full parsed metadata is cached independently of Slave image arrays",
  )
  await loadCollection(masterPreset)
  await loadAllIconImages(masterPreset)
  assert(masterRequests === 1, "Collection and full view share the fresh Master metadata record")
  now = metadata!.updatedAt + iconCacheTTL
  masterName = "Updated Master"
  holdMaster = true
  let previousTitle = ""
  const masterRefresh = loadCollection(masterPreset, (collection) => {
    previousTitle = collection.title
  })
  await settle()
  assert(
    ["Master"].includes(previousTitle),
    "Expired Master metadata is published before refreshing",
  )
  release!()
  assert(
    (await masterRefresh).title === "Updated Master",
    "Refreshed metadata updates the collection",
  )
  const updatedMetadata = await readIconCache<IconSetState>("main:98:900")
  assert(
    updatedMetadata?.value.name === "Updated Master" && updatedMetadata.updatedAt === now,
    "Master metadata is replaced with its own TTL",
  )
  now += iconCacheTTL
  failMaster = true
  let masterRejected = false
  try {
    await loadCollection(masterPreset, (collection) => {
      previousTitle = collection.title
    })
  } catch {
    masterRejected = true
  }
  const retainedMetadata = await readIconCache<IconSetState>("main:98:900")
  assert(
    masterRejected &&
      previousTitle === "Updated Master" &&
      retainedMetadata?.updatedAt === updatedMetadata?.updatedAt &&
      retainedMetadata?.value.name === "Updated Master",
    "Failed Master refresh preserves previous metadata and timestamp",
  )
  result.dataset.result = "PASS"
  result.textContent =
    "PASS: real IndexedDB, iconId records, 6h TTL, previous source, data update, coalescing, atomic failure, retry, legacy records and Master metadata TTL/refresh/failure"
} catch (error) {
  result.dataset.result = "FAIL"
  result.textContent = error instanceof Error ? (error.stack ?? error.message) : String(error)
} finally {
  window.fetch = originalFetch
  Date.now = originalNow
}
