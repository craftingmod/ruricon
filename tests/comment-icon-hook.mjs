import assert from "node:assert/strict"

import { mountCommentIconHook } from "../entrypoints/scripts/comment-icon.ts"

class MockElement extends EventTarget {
  style = {}
  hidden = true
  children = []
  closest(selector) {
    assert.equal(selector, 'button[onclick*="app.comment_icon("]')
    return this.button ?? null
  }
  querySelector(selector) {
    assert.equal(selector, ".comment_icon")
    return this.container ?? null
  }
  setAttribute(name, value) {
    this[name] = value
  }
  replaceChildren(...children) {
    this.children = children
  }
}

const originalDocument = globalThis.document
const originalElement = globalThis.Element
const doc = new EventTarget()
doc.createElement = () => new MockElement()
globalThis.document = doc
globalThis.Element = MockElement

function click(target) {
  const event = new Event("click", { cancelable: true })
  Object.defineProperty(event, "target", { value: target })
  doc.dispatchEvent(event)
  return event
}

try {
  const cleanup = mountCommentIconHook()
  let originalCalls = 0
  doc.addEventListener("click", () => originalCalls++)
  const parent = new MockElement()
  const target = new MockElement()
  target.button = { parentElement: parent }
  assert.equal(click(target).defaultPrevented, false)
  assert.equal(originalCalls, 1)

  const container = new MockElement()
  parent.container = container // A comment button/container added after mounting is also hooked.
  assert.equal(click(target).defaultPrevented, true)
  assert.equal(originalCalls, 1)
  assert.equal(container.hidden, false)
  assert.equal(container.style.display, "block")
  assert.equal(container.children[0].className, "ruricon-icon-view")
  assert.equal(container.children[0].role, "status")
  click(target)
  assert.equal(container.children.length, 1)
  assert.equal(click(new MockElement()).defaultPrevented, false)
  assert.equal(click(null).defaultPrevented, false)

  cleanup()
  assert.equal(click(target).defaultPrevented, false)
  assert.equal(originalCalls, 4)
  console.log("PASS: comment icon interception, dynamic targets, fallback and cleanup")
} finally {
  globalThis.document = originalDocument
  globalThis.Element = originalElement
}
