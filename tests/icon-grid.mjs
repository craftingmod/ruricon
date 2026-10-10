import assert from "node:assert/strict"

import { iconGridPage } from "../entrypoints/lib/icon-grid.ts"

const state = {
  viewport: { width: 625, height: 400 },
  item: { width: 100, height: 100 },
  gap: { column: 5, row: 5 },
  scrollTop: 0,
}
assert.equal(iconGridPage(state), 0)
// Six columns: index 100 shares the row beginning at 96.
assert.equal(iconGridPage({ ...state, scrollTop: 16 * 105 }), 0)
assert.equal(iconGridPage({ ...state, scrollTop: 17 * 105 - 6 }), 0)
assert.equal(iconGridPage({ ...state, scrollTop: 17 * 105 - 5 }), 1)
assert.equal(iconGridPage({ ...state, scrollTop: 17 * 105 }), 1)
// A short final page cannot force its indicator while earlier icons remain at the top.
assert.equal(iconGridPage({ ...state, scrollTop: 35 * 105 - 5 - state.viewport.height }), 1)
assert.equal(
  iconGridPage({ ...state, viewport: { width: 415, height: 400 }, scrollTop: 25 * 105 }),
  1,
)
assert.equal(iconGridPage({ ...state, viewport: { width: 0, height: 0 } }), 0)
assert.equal(iconGridPage({ ...state, item: { width: 0, height: 0 } }), 0)
assert.equal(iconGridPage({ ...state, scrollTop: -10 }), 0)
assert.equal(
  iconGridPage({ ...state, item: { width: 100.8, height: 100 }, scrollTop: 17 * 105 }),
  1,
)
console.log("PASS: viewport page boundaries, partial rows, gaps, resize and initial measurements")
