import assert from "node:assert/strict"

import { orderIconImages } from "../entrypoints/lib/icon-view.ts"

const images = ["plain", "older", "favorite", "newest", "other-favorite", "plain"]
const favorites = new Set(["other-favorite", "favorite"])
const recent = new Map([
  ["newest", 0],
  ["older", 1],
  ["other-favorite", 2],
])
assert.deepEqual(orderIconImages(images, favorites, recent, true), [
  "favorite",
  "other-favorite",
  "newest",
  "older",
  "plain",
  "plain",
])
assert.deepEqual(orderIconImages(images, favorites, recent, false), [
  "favorite",
  "other-favorite",
  "plain",
  "older",
  "newest",
  "plain",
])
assert.deepEqual(images, ["plain", "older", "favorite", "newest", "other-favorite", "plain"])
console.log("PASS: global favorite/recent order, stable groups, duplicates, unchanged source")
