import { getEditUrl, getViewUrl } from "./ruli-constants.ts"

export interface Article {
  board_id: number,
  cate: "" | number, // Use on modify (should be same as category)
  hasimage: number, // Image count (or hookable?)
  action: "proc",
  subject: string, // Title
  subject_limit: 45, // Hardcoded
  category: number, // Internal category
  file: "", // Unused
  content: string, // HTML
  tag_input: "",
  set_notify: 0 | 1,
  is_spoiler: 0 | 1,
  thumbnail_off: 0 | 1,
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

export function createArticle(articleParam: Pick<Article, 
  "board_id" | "subject" | "category" | "content">, modify = false): Article {
  return {
    ...articleParam,
    cate: modify ? articleParam.category : "",
    hasimage: Math.min(articleParam.content.match(/<img/g)?.length ?? 0, 99),
    action: "proc",
    subject_limit: 45,
    file: "",
    tag_input: "",
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

  const domParser = new DOMParser()
  const dom = domParser.parseFromString(await viewRequest.text(), "text/html")
  
  const contentDiv = dom.querySelector(".board_main > .board_main_view .view_content > article > div")
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

export async function writeArticle(article: Article, options: Partial<{
  articleId: number,
  isMobile: boolean,
}> = {}): Promise<{
  success: boolean,
  url: string,
  reason: string,
}> {
  const postfix = options.articleId != null ? `modify/${options.articleId}` : "write"
  const requestURL = getEditUrl(
    options.isMobile ?? false,
    article.board_id,
    postfix
  )

  const articleBody = new URLSearchParams(
    toStringMap(article)
  )

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
}
