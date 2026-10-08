import { gridStyle } from "../constants.ts"
import { iconBoardId } from "../ruli-constants.ts"

export interface IconSetState {
  version: 1
  name: string
  boardId: number
  mainArticleId: number | null
  slaves: { page: number; articleId: number | null; images: string[] }[]
}

const validId = (id: unknown) => id === null || (Number.isSafeInteger(id) && Number(id) > 0)

export function validateState(value: unknown): asserts value is IconSetState {
  const state = value as IconSetState | null
  if (
    !state ||
    state.version !== 1 ||
    state.boardId !== iconBoardId ||
    typeof state.name !== "string" ||
    !state.name.trim() ||
    state.name.length > 38 ||
    !validId(state.mainArticleId) ||
    !Array.isArray(state.slaves)
  ) {
    throw new Error("세트 상태 형식 또는 버전을 확인해주세요.")
  }
  const pages = new Set<number>()
  const ids = new Set<number>(state.mainArticleId === null ? [] : [state.mainArticleId])
  for (const slave of state.slaves) {
    if (
      !slave ||
      !Number.isSafeInteger(slave.page) ||
      slave.page < 1 ||
      pages.has(slave.page) ||
      !validId(slave.articleId) ||
      (slave.articleId !== null && ids.has(slave.articleId)) ||
      !Array.isArray(slave.images) ||
      slave.images.length > 100 ||
      slave.images.some(
        (src) => typeof src !== "string" || !/^https?:\/\//i.test(src) || !URL.canParse(src),
      )
    ) {
      throw new Error("분할 번호, 게시글 ID 또는 이미지 주소를 확인해주세요.")
    }
    pages.add(slave.page)
    if (slave.articleId !== null) ids.add(slave.articleId)
  }
}

export function encodeState(state: IconSetState) {
  validateState(state)
  const bytes = new TextEncoder().encode(JSON.stringify(state))
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "")
}

export function decodeState(text: string): IconSetState {
  const encoded = text.trim()
  if (!/^[\w-]+$/.test(encoded)) throw new Error("세트 상태 인코딩을 확인해주세요.")
  const binary = atob(encoded.replaceAll("-", "+").replaceAll("_", "/"))
  const value: unknown = JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(
      Uint8Array.from(binary, (char) => char.charCodeAt(0)),
    ),
  )
  validateState(value)
  return value
}

export function readMain(html: string) {
  const doc = new DOMParser().parseFromString(html, "text/html")
  const blocks = doc.querySelectorAll('[data-meta="ruricon:v1"]')
  if (!blocks.length) {
    if (
      doc.querySelector('[data-meta^="ruricon:"]') ||
      doc.querySelector('[data-meta="ruricon-state"]')
    ) {
      throw new Error("대표 메타데이터 형식 또는 버전을 확인해주세요.")
    }
    return { html, state: null }
  }
  const block = blocks[0]
  if (blocks.length !== 1 || block !== doc.body.firstElementChild || block.tagName !== "DIV") {
    throw new Error("대표 맨 위의 메타데이터 블록을 확인해주세요.")
  }
  const states = block.querySelectorAll('[data-meta="ruricon-state"]')
  if (states.length !== 1 || doc.querySelectorAll('[data-meta="ruricon-state"]').length !== 1)
    throw new Error("대표 상태 블록을 확인해주세요.")
  const state = decodeState(states[0].textContent ?? "")
  // Locate only the leading managed div; keep the user's remaining HTML byte-for-byte.
  const tokens = html.matchAll(/<!--[\s\S]*?-->|<\/?[a-z][^>"']*(?:(?:"[^"]*"|'[^']*')[^>"']*)*>/gi)
  let depth = 0
  let started = false
  for (const token of tokens) {
    if (!started) {
      if (html.slice(0, token.index).trim() || !/^<div\b/i.test(token[0])) break
      started = true
    }
    if (/^<div\b/i.test(token[0])) depth++
    if (/^<\/div\s*>/i.test(token[0]) && --depth === 0) {
      return { html: html.slice(token.index + token[0].length), state }
    }
  }
  throw new Error("대표 메타데이터 경계를 확인해주세요.")
}

export function imageHtml(images: string[]) {
  const grid = document.createElement("p")
  grid.setAttribute("style", gridStyle)
  images.forEach((src, index) => {
    const image = document.createElement("img")
    image.setAttribute("src", src)
    image.alt = String(index)
    grid.append(image)
  })
  return images.length ? grid.outerHTML : ""
}

export function compileSlave(images: string[], mainId: number) {
  if (!Number.isSafeInteger(mainId) || mainId < 1) throw new Error("대표 ID를 확인해주세요.")
  const navigation = document.createElement("p")
  navigation.setAttribute("style", "margin:0 0 12px")
  const link = document.createElement("a")
  link.setAttribute("href", `/community/board/${iconBoardId}/read/${mainId}`)
  link.textContent = "대표로 이동"
  link.setAttribute(
    "style",
    "display:inline-block;padding:6px 12px;border:1px solid #7fa5d8;border-radius:6px;background:#f1f4f8;color:#24569c;font-size:14px;text-decoration:none",
  )
  navigation.append(link)
  return navigation.outerHTML + imageHtml(images)
}

export function compileMain(html: string, state: IconSetState) {
  const body = readMain(html).html
  const block = document.createElement("div")
  block.dataset.meta = "ruricon:v1"
  block.contentEditable = "false"
  block.setAttribute(
    "style",
    "border:1px solid #7fa5d8;border-radius:9px;background:#f1f4f8;padding:18px;margin:12px 0;color:#333;font-size:14px;line-height:1.6",
  )
  const heading = document.createElement("strong")
  heading.textContent = "😙 아이콘 묶음 · 읽기 전용"
  const pages = document.createElement("div")
  pages.dataset.meta = "ruricon-pages"
  pages.setAttribute("style", "display:flex;align-items:center;gap:10px;margin:12px 0")
  pages.textContent = "페이지 "
  for (const slave of state.slaves) {
    if (slave.articleId === null) continue
    const link = document.createElement("a")
    link.setAttribute("href", `/community/board/${state.boardId}/read/${slave.articleId}`)
    link.setAttribute(
      "style",
      "display:inline-block;padding:7px 15px;border:1px solid #ddd;border-radius:6px;background:#fff;color:#333;text-decoration:none",
    )
    link.textContent = String(slave.page)
    pages.append(link)
  }
  const stored = document.createElement("div")
  stored.dataset.meta = "ruricon-state"
  stored.style.display = "none"
  stored.textContent = encodeState(state)
  block.append(heading, pages, stored)
  return block.outerHTML + body
}

export function setNameLimit(mainId: number | null = null, page = 1) {
  return Math.min(36, 41 - String(mainId ?? 9999).length - String(Math.max(1, page)).length)
}

export function setTitle(name: string, page: number, mainId: number | null) {
  const limit = setNameLimit(mainId, page)
  if (!name.trim() || name.length > limit) throw new Error(`세트명은 1~${limit}자로 입력해주세요.`)
  if (
    !Number.isSafeInteger(page) ||
    page < 0 ||
    (page > 0 && (mainId === null || !validId(mainId)))
  )
    throw new Error("페이지 번호 또는 대표 ID를 확인해주세요.")
  const title = page === 0 ? `${name} (M)` : `${name}${page} (S${mainId})`
  if (title.length > 45) throw new Error("최종 제목이 45자를 넘습니다. 세트명을 줄여주세요.")
  return title
}
