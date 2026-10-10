import assert from "node:assert/strict"
import { readFileSync, readdirSync } from "node:fs"
import { runInNewContext } from "node:vm"

import { mobileDomain, pcDomain } from "../entrypoints/lib/ruli-constants.ts"

const output = new URL("../.output/userscript/", import.meta.url)
assert.deepEqual(readdirSync(output), ["rulicon.user.js"])
const code = readFileSync(new URL("rulicon.user.js", output), "utf8")
const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"))
assert.ok(code.startsWith("// ==UserScript==\n"))
assert.ok(code.includes(`// @version ${version}\n`))
assert.deepEqual(
  [...code.matchAll(/^\/\/ @match (.+)$/gm)].map((match) => match[1]),
  [pcDomain, mobileDomain].map((domain) => `https://${domain}/*`),
)
assert.ok(code.includes("// @grant none\n"))
assert.ok(code.includes("// @sandbox raw\n"))
assert.ok(code.includes("// @run-at document-idle\n"))

const styles = []
const buttons = []
const listeners = new Map()
let observerDisconnects = 0
runInNewContext(code, {
  MutationObserver: class {
    observe() {}
    disconnect() {
      observerDisconnects++
    }
  },
  console: { log() {} },
  document: {
    documentElement: { style: {} },
    addEventListener() {},
    removeEventListener() {},
    querySelector: () => null,
    createElement: () => ({ style: {}, addEventListener() {} }),
    head: { append: (style) => styles.push(style) },
    body: { append: (button) => buttons.push(button) },
  },
  window: { addEventListener: (name, callback) => listeners.set(name, callback) },
  location: {
    href: "https://bbs.ruliweb.com/community/board/98/write",
    pathname: "/community/board/98/write",
  },
})
await Promise.resolve()
assert.equal(styles.length, 1)
assert.ok(styles[0].textContent.includes(".ruricon-upload"))
assert.equal(buttons.length, 1)
assert.equal(buttons[0].textContent, "Rulicon 실행 확인")
assert.ok(listeners.has("pagehide"))
listeners.get("pagehide")({ persisted: true })
assert.equal(observerDisconnects, 0)
listeners.get("pagehide")({ persisted: false })
assert.equal(observerDisconnects, 2)
console.log("PASS: userscript metadata, standalone JS/CSS, editor startup and pagehide")
