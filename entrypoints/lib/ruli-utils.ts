import { articlePostDelayMs } from "./constants.ts"
import { getEditUrl, getIconImagesUrl, getViewUrl, iconListUrl, removeFavorIconUrl } from "./ruli-constants.ts"

export interface Article {
  board_id: number
  cate: "" | number // Use on modify (should be same as category)
  hasimage: number // Image count (or hookable?)
  action: "proc"
  subject: string // Title
  subject_limit: 45 // Hardcoded
  category: number // Internal category
  file: "" // Unused
  content: string // HTML
  tag_input: string // `#aaa #bbb` like (` ` joined with `#` prefix)
  set_notify: 0 | 1
  is_spoiler: 0 | 1
  thumbnail_off: 0 | 1
  content_image_meta: "{}"
}

export function toStringMap<T extends object>(record: T): Record<keyof T, string> {
  const kvPair: Record<keyof T, string> = Object.create(null)
  for (const [key, value] of Object.entries(record)) {
    // @ts-expect-error keyof T is ensured
    kvPair[key] = String(value)
  }
  return kvPair
}

type ManualArticle = Pick<Article, "board_id" | "subject" | "category" | "content"> & {
  raw_tags?: string[]
}

export function createArticle(articleParam: ManualArticle, modify = false): Article {
  return {
    ...articleParam,
    cate: modify ? articleParam.category : "",
    hasimage: Math.min(articleParam.content.match(/<img/g)?.length ?? 0, 99),
    action: "proc",
    subject_limit: 45,
    file: "",
    tag_input:
      articleParam.raw_tags != null ? articleParam.raw_tags.map((v) => `#${v}`).join(" ") : "",
    set_notify: 1,
    is_spoiler: 0,
    thumbnail_off: 0,
    content_image_meta: "{}",
  }
}

export async function readArticle(boardId: number, articleId: number, isMobile = false) {
  const requestURL = getViewUrl(boardId, articleId, isMobile)

  const viewRequest = await fetch(requestURL, {
    method: "get",
    mode: "cors",
    redirect: "follow",
  })
  if (!viewRequest.ok) return { success: false, content: "" }

  const domParser = new DOMParser()
  const dom = domParser.parseFromString(await viewRequest.text(), "text/html")

  const contentDiv = dom.querySelector(
    ".board_main > .board_main_view .view_content > article > div",
  )
  if (contentDiv == null) {
    return {
      success: false,
      content: "",
    }
  }
  return {
    success: true,
    content: contentDiv.innerHTML,
  }
}

export function parseArticleURL(rawURL: string) {
  let pathname: string
  try {
    pathname = new URL(rawURL).pathname
  } catch {
    throw new Error("Not article URL")
  }
  const match = pathname.match(/^\/community\/board\/(\d+)\/read\/(\d+)\/?$/)
  if (match == null) {
    throw new Error("Not article URL")
  }
  return {
    boardId: Number(match[1]),
    articleId: Number(match[2]),
  }
}

// shortcut: this page tracks its own writes; share the cooldown when cross-tab coordination is needed.
let nextWriteAt = 0
let pendingWrites = Promise.resolve()
let nextPostAt = 0
let pendingPosts = Promise.resolve()

export async function writeArticle(
  article: Article,
  options: Partial<{
    articleId: number
    isMobile: boolean
    onWait: (seconds: number) => void
  }> = {},
): Promise<{
  success: boolean
  url: string
  reason: string
}> {
  let release: (() => void) | undefined
  let releasePost: (() => void) | undefined
  if (options.articleId == null) {
    const previous = pendingWrites
    pendingWrites = new Promise<void>((resolve) => {
      release = resolve
    })
    await previous
  }
  try {
    if (release) {
      while (Date.now() < nextWriteAt) {
        options.onWait?.(Math.ceil((nextWriteAt - Date.now()) / 1000))
        await new Promise((resolve) =>
          setTimeout(resolve, Math.min(1000, nextWriteAt - Date.now())),
        )
      }
    }
    const previousPost = pendingPosts
    pendingPosts = new Promise<void>((resolve) => {
      releasePost = resolve
    })
    await previousPost
    while (Date.now() < nextPostAt) {
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(articlePostDelayMs, nextPostAt - Date.now())),
      )
    }
    if (release) options.onWait?.(0)
    const postfix = options.articleId != null ? `modify/${options.articleId}` : "write"
    const requestURL = getEditUrl(options.isMobile ?? false, article.board_id, postfix)

    const articleBody = new URLSearchParams(toStringMap(article))

    const writeRequest = await fetch(requestURL, {
      method: "POST",
      mode: "cors",
      redirect: "follow",
      body: articleBody,
    })
    console.log(writeRequest.status)
    const responseText = await writeRequest.text()

    if (writeRequest.redirected) {
      // Success
      return {
        success: true,
        url: writeRequest.url,
        reason: "",
      }
    }

    // Fail
    let errorReason = responseText.match(/<p class="desc">.*?<\/p>/)?.[0] ?? ""

    if (errorReason.length > 20) {
      errorReason = errorReason.substring(16, errorReason.length - 4)
    } else {
      errorReason = responseText
    }

    return {
      success: false,
      url: writeRequest.url,
      reason: errorReason,
    }
  } finally {
    if (releasePost) {
      nextPostAt = Date.now() + articlePostDelayMs
      releasePost()
    }
    if (release) {
      // Count from response completion, with five seconds beyond the site's 30-second limit.
      nextWriteAt = Date.now() + 35_000
      release()
    }
  }
}

async function requestGet<T>(url: string) {
  const rawRequest = await fetch(url, {
    method: "get",
    mode: "cors",
    redirect: "follow",
    credentials: "include",
  })
  if (rawRequest.status !== 200) {
    throw new Error(`Server status error: ${rawRequest.status}`)
  }
  return (await rawRequest.json()) as T
}

export function getLastId(str: string) {
  const match = str.match(/,\s*["']?(\d+)["']?\s*\)\s*;?\s*$/)
  const id = match ? Number(match[1]) : 0
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

/**
 * Read user's favorite iconPacks
 */
export async function readIconFavorite() {
  const json = await requestGet<{
    success: boolean
    html: string
  }>(iconListUrl)

  if (!(json.success ?? false)) {
    throw new Error(`Server responded with fail: ${JSON.stringify(json) ?? "unknown"}`)
  }

  const parser = new DOMParser()
  const $ = parser.parseFromString(json.html, "text/html")
  const iconElements = Array.from(
    $.querySelectorAll<HTMLDivElement>('[onclick*="app.icon_data_show("][title]'),
  )
    .map((outDOM) => {
      const onClickScript = outDOM.getAttribute("onclick")
      if (onClickScript == null) {
        console.error(`[RuliUtil] Icon onClick is null. DOM: ${outDOM.outerHTML}`)
        return null
      }

      const iconId = getLastId(onClickScript)
      if (iconId == null) {
        console.error(`[RuliUtil] Icon script is unknown. onClick: ${onClickScript}`)
        return null
      }

      const iconTitle = outDOM.getAttribute("title") ?? "Unknown Title"

      const thumbnail = Object.create(null) as {
        type: "image" | "video"
        src: string
      }

      const imageDOM = outDOM.querySelector<HTMLImageElement>("img")
      if (imageDOM == null) {
        const videoDOM = outDOM.querySelector<HTMLVideoElement>("video")
        if (videoDOM == null) {
          console.error(`[RuliUtil] Icon thumbnail is unknown. dom: ${outDOM.outerHTML}`)
          return null
        }
        thumbnail.src = videoDOM.getAttribute("src") ?? ""

        // mp4 auto convert
        if (thumbnail.src.endsWith(".mp4?gif")) {
          thumbnail.src = thumbnail.src.replace(".mp4?gif", ".gif")
          thumbnail.type = "image"
        } else {
          thumbnail.type = "video"
        }
      } else {
        thumbnail.type = "image"
        thumbnail.src = imageDOM.getAttribute("src") ?? ""
      }

      return {
        iconId,
        iconTitle,
        thumbnail,
      }
    })
    .filter((v) => v != null)

  // Force last as AD icon
  const adLeftover = iconElements.splice(0, 2)
  iconElements.push(...adLeftover)

  return iconElements
}

/**
 * Read icon images from iconPack by `iconId`
 * @param iconId IconPack ID
 * @param offset Read offset
 * @param limit Read limit (server default: 100)
 * @returns Paged icon info
 */
export async function readIconImages(iconId: number, offset = 0, limit = 100) {
  const requestUrl = getIconImagesUrl(iconId, offset, limit)
  const json = await requestGet<{
    success: boolean
    html: string
    has_more: boolean
    next_offset: number
    total_count: number
  }>(requestUrl)

  if (!(json.success ?? false)) {
    throw new Error(`Server responded with fail: ${JSON.stringify(json) ?? "unknown"}`)
  }

  const parser = new DOMParser()
  const $ = parser.parseFromString(json.html, "text/html")

  const firstInfoDOM = $.body.querySelector<HTMLDivElement>(":scope > div:first-of-type")
  if (!firstInfoDOM && offset === 0) throw new Error("아이콘팩 정보를 찾을 수 없습니다.")

  const title = firstInfoDOM?.querySelector(":scope > a")?.textContent ?? "Unknown title"

  const realIconId =
    offset > 0
      ? iconId
      : (getLastId(
          firstInfoDOM?.querySelector<HTMLSpanElement>(":scope > span")?.getAttribute("onclick") ??
            "0",
        ) ?? 0)

  if (realIconId <= 0) {
    throw new Error("Unknown realIconId!")
  }

  const iconSrc = Array.from(
    $.body.querySelectorAll<HTMLImageElement | HTMLVideoElement>(
      ".select_icon_box > :is(img, video), :scope > img, :scope > video",
    ),
  )
    .map((media) => {
      const src = media.getAttribute("src")
      if (src == null) {
        return null
      }
      return src
    })
    .filter((v) => v != null)

  return {
    hasMore: json.has_more,
    nextOffset: json.next_offset,
    total_count: json.total_count,
    title,
    realIconId,
    icons: iconSrc,
  }
}

export async function removeFavoriteIconSet(iconId: number) {
  
  if (iconId === 3213 || iconId === 1917) {
    throw new Error("광고 용도로 고정된 아이콘은 삭제가 불가능합니다.")
  }

  const body = new URLSearchParams({
    num: String(iconId)
  })

  const rawRequest = await fetch(removeFavorIconUrl, {
    method: "post",
    mode: "cors",
    credentials: "include",
    body,
  })
  if (rawRequest.status !== 200) {
    return false
  }
  const json = (await rawRequest.json()) as { success?: boolean }

  return Boolean(json?.success ?? false)
}