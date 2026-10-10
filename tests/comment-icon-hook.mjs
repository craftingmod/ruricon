import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve, relative } from "node:path"

import { chromeExec } from "../entrypoints/lib/constants.ts"

const cacheTest = process.argv.includes("--cache")
const port = 5187
const url = process.argv.includes("--cache")
  ? `http://127.0.0.1:${port}/tests/icon-cache.html`
  : `http://127.0.0.1:${port}/tests/comment-icon-view.html${process.argv.includes("--editor") ? "?editor" : process.argv.includes("--preset-dialog") ? "?preset-dialog" : process.argv.includes("--image-preset") ? "?image-preset" : ""}`
const server = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "--config",
    "tests/vite.config.ts",
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
    "--strictPort",
  ],
  {
    windowsHide: true,
    stdio: "pipe",
    env: { ...process.env, __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS: "m.ruliweb.com" },
  },
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
  for (const testUrl of [url, url.replace("127.0.0.1", "m.ruliweb.com")]) {
    const browser = spawn(
      chromeExec,
      [
        "--headless",
        "--disable-gpu",
        ...(process.argv.includes("--preset-dialog")
          ? [`--window-size=${testUrl.includes("m.ruliweb.com") ? "390,844" : "1800,900"}`]
          : []),
        "--no-first-run",
        "--no-default-browser-check",
        "--no-proxy-server",
        "--host-resolver-rules=MAP m.ruliweb.com 127.0.0.1",
        `--user-data-dir=${profile}`,
        ...(cacheTest
          ? ["--remote-debugging-port=5188"]
          : ["--virtual-time-budget=12000", "--dump-dom"]),
        testUrl,
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
    if (cacheTest) {
      let page
      for (let attempt = 0; attempt < 100; attempt++) {
        try {
          page = (await (await fetch("http://127.0.0.1:5188/json/list")).json()).find(
            (tab) => tab.url === testUrl,
          )
        } catch {}
        if (page) break
        await new Promise((resolve) => setTimeout(resolve, 100))
      }
      assert.ok(page, errors)
      const socket = new WebSocket(page.webSocketDebuggerUrl)
      await new Promise((resolve, reject) => {
        socket.onopen = resolve
        socket.onerror = reject
      })
      let commandId = 0
      const evaluate = () =>
        new Promise((resolve) => {
          const id = ++commandId
          socket.onmessage = (event) => {
            const response = JSON.parse(event.data)
            if (response.id === id) resolve(response.result?.result?.value ?? "")
          }
          socket.send(
            JSON.stringify({
              id,
              method: "Runtime.evaluate",
              params: {
                expression: "document.querySelector('#result')?.outerHTML ?? ''",
                returnByValue: true,
              },
            }),
          )
        })
      try {
        for (let attempt = 0; attempt < 200; attempt++) {
          output = await evaluate()
          if (output.includes("data-result=")) break
          await new Promise((resolve) => setTimeout(resolve, 100))
        }
      } finally {
        socket.send(JSON.stringify({ id: ++commandId, method: "Browser.close" }))
        await new Promise((resolve) => {
          if (browser.exitCode !== null) resolve()
          else browser.once("exit", resolve)
        })
        clearTimeout(timer)
        socket.close()
        await new Promise((resolve) => setTimeout(resolve, 500))
      }
    } else {
      const exitCode = await new Promise((resolve, reject) => {
        browser.on("exit", resolve)
        browser.on("error", reject)
      })
      clearTimeout(timer)
      assert.equal(exitCode, 0, errors)
    }
    const result = output.match(/<p id="result"[^>]*>[\s\S]*?<\/p>/)?.[0] ?? output.slice(0, 2000)
    assert.ok(result.includes('data-result="PASS"'), result)
    console.log(`${new URL(testUrl).hostname}: ${result.replace(/<[^>]+>/g, "")}`)
  }
} catch (error) {
  console.error(error)
  throw error
} finally {
  server.kill()
  const withinTemp = relative(tempRoot, resolve(profile))
  assert.ok(!withinTemp.startsWith("..") && withinTemp.startsWith("ruricon-icon-view-"))
  rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
}
