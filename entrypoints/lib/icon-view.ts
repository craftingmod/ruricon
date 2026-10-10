import { readMain } from "./editor/articleMeta.ts"
import { iconBoardId, mobileDomain } from "./ruli-constants.ts"
import {
  readArticle,
  readIconFavorite,
  readIconImages,
  removeFavoriteIconSet,
} from "./ruli-utils.ts"

export type Preset = {
  id: number
  title: string
  mainId: number | null
  imageCount?: number
  favoriteIds?: number[]
  thumbnail: { type: "image" | "video"; src: string }
}
export type IconPage = {
  number: number
  images: string[]
  nextOffset: number | null
  total: number
}
export type IconCollection = { title: string; pages: IconPage[]; nativeId: number | null }

export function orderPresets(presets: Preset[], favorites: number[]) {
  const favoriteIds = new Set(favorites)
  return [...presets].sort((a, b) => Number(favoriteIds.has(b.id)) - Number(favoriteIds.has(a.id)))
}

const requests = new Map<string, { expires: number; promise: Promise<unknown>; value?: unknown }>()

function cached<T>(key: string, request: () => Promise<T>): Promise<T> {
  const existing = requests.get(key)
  if (existing && existing.expires > Date.now()) return existing.promise as Promise<T>
  const promise = request()
    .then((value) => {
      const entry = requests.get(key)
      if (entry?.promise === promise) entry.value = value
      return value
    })
    .catch((error) => {
      if (requests.get(key)?.promise === promise) requests.delete(key)
      throw error
    })
  requests.set(key, { expires: Date.now() + 60_000, promise })
  return promise
}

function cachedValue<T>(key: string): T | undefined {
  const entry = requests.get(key)
  return entry && entry.expires > Date.now() ? (entry.value as T | undefined) : undefined
}

export function getCachedImageCount(preset: Preset): number | undefined {
  const collection = cachedValue<IconCollection>(`collection:${preset.id}`)
  if (collection) return collection.pages[0]?.total ?? 0
  return preset.mainId === null ? cachedValue<IconPage>(`native:${preset.id}:0`)?.total : undefined
}

export function loadPresets() {
  return cached("presets", async () => {
    const favorites = await readIconFavorite()
    const presets = new Map<number, Preset>()
    for (const favorite of favorites) {
      const match = favorite.iconTitle.match(/\s*\((M|S(\d+))\)$/)
      const mainId = match ? (match[1] === "M" ? favorite.iconId : Number(match[2])) : null
      if (mainId !== null && (!Number.isSafeInteger(mainId) || mainId < 1)) continue
      const id = mainId ?? favorite.iconId
      const existing = presets.get(id)
      if (!presets.has(id) || match?.[1] === "M") {
        presets.set(id, {
          id,
          title: favorite.iconTitle,
          mainId,
          thumbnail: favorite.thumbnail,
          favoriteIds: [...(existing?.favoriteIds ?? []), favorite.iconId],
        })
      } else {
        existing!.favoriteIds!.push(favorite.iconId)
      }
    }
    return [...presets.values()]
  })
}

export async function removePresetFavorites(preset: Preset) {
  preset.favoriteIds ??= [preset.id]
  try {
    while (preset.favoriteIds.length) {
      if (!(await removeFavoriteIconSet(preset.favoriteIds[0])))
        throw new Error("프리셋을 삭제하지 못했습니다. 다시 시도해주세요.")
      preset.favoriteIds.shift()
    }
  } finally {
    requests.delete("presets")
  }
}

export function loadNativePage(id: number, offset: number): Promise<IconPage> {
  return cached(`native:${id}:${offset}`, async () => {
    const result = await readIconImages(id, offset, 100)
    if (
      !Number.isSafeInteger(result.total_count) ||
      result.total_count < 0 ||
      typeof result.hasMore !== "boolean"
    ) {
      throw new Error("아이콘 페이지 정보를 확인해주세요.")
    }
    if (
      result.hasMore &&
      (!Number.isSafeInteger(result.nextOffset) || result.nextOffset <= offset)
    ) {
      throw new Error("다음 페이지 위치를 확인할 수 없습니다.")
    }
    if (result.icons.some((src) => !/^https?:\/\//i.test(src) || !URL.canParse(src))) {
      throw new Error("아이콘 주소를 확인해주세요.")
    }
    /*
      When removing ?icon
      ...new Set(
        result.icons.map((src) => {
          const url = new URL(src)
          url.searchParams.delete("icon")
          return url.href
        }),
      ),
    */
    return {
      number: offset / 100 + 1,
      images: [...new Set(result.icons)],
      nextOffset: result.hasMore ? result.nextOffset : null,
      total: result.total_count,
    }
  })
}

export function loadCollection(preset: Preset): Promise<IconCollection> {
  return cached(`collection:${preset.id}`, async () => {
    if (preset.mainId === null) {
      return {
        title: preset.title,
        pages: [await loadNativePage(preset.id, 0)],
        nativeId: preset.id,
      }
    }
    const article = await readArticle(
      iconBoardId,
      preset.mainId,
      location.hostname === mobileDomain,
    )
    if (!article.success) throw new Error("대표 게시글을 읽지 못했습니다.")
    const { state } = readMain(article.content)
    if (!state || state.mainArticleId !== preset.mainId) {
      throw new Error("대표 게시글의 묶음 metadata를 확인해주세요.")
    }
    const pages = [...state.slaves]
      .filter((slave) => slave.articleId !== null)
      .sort((a, b) => a.page - b.page)
      .map((slave) => ({
        number: slave.page,
        images: [
          ...new Set(
            slave.images.map((src) => {
              const url = new URL(src)
              url.searchParams.set("icon", String(slave.articleId))
              return url.href
            }),
          ),
        ],
        nextOffset: null,
      }))
    const total = pages.reduce((sum, page) => sum + page.images.length, 0)
    return {
      title: state.name,
      pages: pages.map((page) => ({ ...page, total })),
      nativeId: null,
    }
  })
}
