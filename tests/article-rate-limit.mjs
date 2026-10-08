import assert from "node:assert/strict"

import { articlePostDelayMs } from "../entrypoints/lib/constants.ts"
import { createArticle, writeArticle } from "../entrypoints/lib/ruli-utils.ts"

const originalFetch = globalThis.fetch
const originalNow = Date.now
const originalTimeout = globalThis.setTimeout
let now = 100_000
let fail = false
const requests = []
Date.now = () => now
globalThis.setTimeout = (callback, delay) => {
  now += delay
  callback()
  return 0
}
globalThis.fetch = async (url) => {
  const path = new URL(url).pathname
  requests.push({ path, start: now })
  now += 250 // Response handling takes time, in addition to the cooldown.
  return {
    status: 200,
    redirected: !fail,
    url: "https://bbs.ruliweb.com/community/board/98/read/4989",
    text: async () => "failed",
  }
}
const article = createArticle({
  board_id: 98,
  category: 8,
  subject: "간격 검증",
  content: "<p>본문</p>",
})
try {
  await writeArticle(article)
  await writeArticle(article, { articleId: 4989 })
  await writeArticle(article, { articleId: 4990 })
  assert.equal(requests[1].start - requests[0].start, articlePostDelayMs + 250)
  assert.equal(requests[2].start - requests[1].start, articlePostDelayMs + 250)
  fail = true
  assert.equal((await writeArticle(article, { articleId: 4990 })).success, false)
  fail = false
  await writeArticle(article, { articleId: 4990 })
  assert.equal(
    requests[4].start - requests[3].start,
    articlePostDelayMs + 250,
    "Failed modifies retain the cooldown",
  )
  await writeArticle(article)
  assert.equal(
    requests[5].start - requests[0].start,
    35_250,
    "Modifies do not restart the create cooldown",
  )
  await Promise.all([
    writeArticle(article, { articleId: 4989 }),
    writeArticle(article, { articleId: 4990 }),
  ])
  assert.equal(
    requests[7].start - requests[6].start,
    articlePostDelayMs + 250,
    "Concurrent modifies are serialized",
  )
  const start = now
  await Promise.all([writeArticle(article), writeArticle(article, { articleId: 4989 })])
  assert.ok(
    requests[8].path.endsWith("/modify/4989") && requests[8].start - start < 35_000,
    "Modifies bypass the 35-second create wait",
  )
  for (let index = 1; index < requests.length; index++) {
    assert.ok(
      requests[index].start - requests[index - 1].start >= articlePostDelayMs + 250,
      "All POSTs wait 400ms after the prior response",
    )
  }
  console.log(
    "PASS: modify 400ms cooldown, mixed/concurrent requests, failures, create 35s retained",
  )
} finally {
  globalThis.fetch = originalFetch
  Date.now = originalNow
  globalThis.setTimeout = originalTimeout
}
