import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve, relative } from "node:path"

import { chromeExec } from "../entrypoints/lib/constants.ts"

const port = 5187
const url = `http://127.0.0.1:${port}/tests/comment-icon-view.html`
const server = spawn(
  process.execPath,
  ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
  { windowsHide: true, stdio: "pipe" },
)
let serverLog = ""
server.stdout.on("data", (chunk) => {
  serverLog += chunk
})
server.stderr.on("data", (chunk) => {
  serverLog += chunk
})
const tempRoot = resolve(tmpdir())
const profile = mkdtempSync(join(tempRoot, "ruricon-icon-view-"))
try {
  let ready = false
  for (let attempt = 0; attempt < 50; attempt++) {
    if (server.exitCode !== null) throw new Error(serverLog)
    try {
      ready = (await fetch(url)).ok
    } catch {}
    if (ready) break
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  assert.ok(ready, `Vite startup failed: ${serverLog}`)
  const browser = spawn(
    chromeExec,
    [
      "--headless",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      `--user-data-dir=${profile}`,
      "--virtual-time-budget=12000",
      "--dump-dom",
      url,
    ],
    { windowsHide: true, stdio: "pipe" },
  )
  let output = ""
  let errors = ""
  browser.stdout.on("data", (chunk) => {
    output += chunk
  })
  browser.stderr.on("data", (chunk) => {
    errors += chunk
  })
  const timer = setTimeout(() => browser.kill(), 45000)
  const exitCode = await new Promise((resolve, reject) => {
    browser.on("exit", resolve)
    browser.on("error", reject)
  })
  clearTimeout(timer)
  assert.equal(exitCode, 0, errors)
  const result = output.match(/<p id="result"[^>]*>[\s\S]*?<\/p>/)?.[0] ?? output.slice(0, 2000)
  assert.ok(result.includes('data-result="PASS"'), result)
  console.log(result.replace(/<[^>]+>/g, ""))
} finally {
  server.kill()
  const withinTemp = relative(tempRoot, resolve(profile))
  assert.ok(!withinTemp.startsWith("..") && withinTemp.startsWith("ruricon-icon-view-"))
  rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
}
