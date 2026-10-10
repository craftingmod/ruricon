import { mock } from "bun:test"
import assert from "node:assert/strict"

const calls = []
const first = "https://example.com/first.png?icon=123"
const last = "https://example.com/last.png?icon=456"
let invalidOffset = false
mock.module("../entrypoints/lib/ruli-utils.ts", () => ({
  readIconFavorite() {},
  removeFavoriteIconSet() {},
  async readArticle() {
    return { success: true, content: "metadata" }
  },
  async readIconImages(id, offset, limit) {
    calls.push([id, offset, limit])
    return offset === 0
      ? { icons: [first, first], hasMore: true, nextOffset: invalidOffset ? 0 : 7 }
      : { icons: [last], hasMore: false }
  },
}))
mock.module("../entrypoints/lib/editor/articleMeta.ts", () => ({
  readMain() {
    return {
      state: {
        mainArticleId: 900,
        slaves: [
          { page: 3, articleId: 902 },
          { page: 2, articleId: null },
          { page: 1, articleId: 901 },
        ],
      },
    }
  },
}))
globalThis.location = { hostname: "bbs.ruliweb.com" }
const { loadAllIconImages } = await import("../entrypoints/lib/icon-view.ts")
assert.deepEqual(await loadAllIconImages({ id: 10, mainId: null }), [first, first, last])
assert.deepEqual(calls.splice(0), [
  [10, 0, 100],
  [10, 7, 100],
])
assert.deepEqual(await loadAllIconImages({ id: 900, mainId: 900 }), [
  first,
  first,
  last,
  first,
  first,
  last,
])
assert.deepEqual(calls.splice(0), [
  [901, 0, 100],
  [901, 7, 100],
  [902, 0, 100],
  [902, 7, 100],
])
invalidOffset = true
await assert.rejects(loadAllIconImages({ id: 10, mainId: null }), /다음 페이지/)
console.log("PASS: all pages, raw URL order and duplicates, segment order, invalid offset")
