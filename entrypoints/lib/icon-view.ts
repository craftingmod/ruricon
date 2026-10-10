import { readMain, validateState } from "./editor/articleMeta.ts"
import { loadIconCache, readIconCache } from "./icon-cache.ts"
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
export const fixedAdPresetIds = [1917, 3213]

export function orderIconImages(
  images: string[],
  favorites: Set<string>,
  recent: Map<string, number>,
  prioritizeRecent: boolean,
) {
  return [...images].sort(
    (a, b) =>
      Number(favorites.has(b)) - Number(favorites.has(a)) ||
      (favorites.has(a) || !prioritizeRecent ? 0 : (recent.get(a) ?? 10) - (recent.get(b) ?? 10)),
  )
}

export function orderPresets(presets: Preset[], favorites: number[]) {
  const positions = new Map(favorites.map((id, index) => [id, index]))
  return [...presets].sort(
    (a, b) => (positions.get(a.id) ?? favorites.length) - (positions.get(b.id) ?? favorites.length),
  )
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

const imageCounts = new Map<number, number>()

export function getCachedImageCount(preset: Preset): number | undefined {
  return imageCounts.get(preset.id)
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

const nativeKey = (id: number) => `icon:${id}`
function validateImages(value: unknown): asserts value is string[] {
  if (
    !Array.isArray(value) ||
    value.some((src) => typeof src !== "string" || !/^https?:\/\//i.test(src) || !URL.canParse(src))
  )
    throw new Error("아이콘 캐시 형식을 확인해주세요.")
}
async function fetchNativePage(id: number, offset: number): Promise<IconPage> {
  const result = await readIconImages(id, offset, 100)
  if (
    !Number.isSafeInteger(result.total_count) ||
    result.total_count < 0 ||
    typeof result.hasMore !== "boolean"
  ) {
    throw new Error("아이콘 페이지 정보를 확인해주세요.")
  }
  if (result.hasMore && (!Number.isSafeInteger(result.nextOffset) || result.nextOffset <= offset)) {
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
    images: result.icons,
    nextOffset: result.hasMore ? result.nextOffset : null,
    total: result.total_count,
  }
}

function loadNativeImages(id: number, previous?: (value: string[]) => void): Promise<string[]> {
  return loadIconCache(
    nativeKey(id),
    async () => {
      const images: string[] = []
      let offset = 0
      while (true) {
        const { images: pageImages, ...page } = await fetchNativePage(id, offset)
        images.push(...pageImages)
        if (page.nextOffset === null) break
        offset = page.nextOffset
      }
      return images
    },
    previous,
    validateImages,
  )
}

export async function loadNativePage(
  id: number,
  offset: number,
  previous?: (page: IconPage) => void,
): Promise<IconPage> {
  const apply = (images: string[]): IconPage => {
    imageCounts.set(id, images.length)
    return {
      number: offset / 100 + 1,
      total: images.length,
      nextOffset: offset + 100 < images.length ? offset + 100 : null,
      images: [...new Set(images.slice(offset, offset + 100))],
    }
  }
  return apply(await loadNativeImages(id, (value) => previous?.(apply(value))))
}

function loadMainState(
  id: number,
  previous?: (state: NonNullable<ReturnType<typeof readMain>["state"]>) => void,
) {
  return loadIconCache(
    `main:${iconBoardId}:${id}`,
    async () => {
      const article = await readArticle(iconBoardId, id, location.hostname === mobileDomain)
      if (!article.success) throw new Error("대표 게시글을 읽지 못했습니다.")
      const { state } = readMain(article.content)
      if (!state || state.mainArticleId !== id)
        throw new Error("대표 게시글의 묶음 metadata를 확인해주세요.")
      return state
    },
    previous,
    validateState,
  )
}

export async function loadCollection(
  preset: Preset,
  previous?: (collection: IconCollection) => void,
): Promise<IconCollection> {
  const remember = (collection: IconCollection) => {
    imageCounts.set(preset.id, collection.pages[0]?.total ?? 0)
    return collection
  }
  if (preset.mainId === null) {
    const collection = (page: IconPage) =>
      remember({ title: preset.title, pages: [page], nativeId: preset.id })
    return collection(await loadNativePage(preset.id, 0, (page) => previous?.(collection(page))))
  }
  const collection = (state: NonNullable<ReturnType<typeof readMain>["state"]>): IconCollection => {
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
    return remember({
      title: state.name,
      pages: pages.map((page) => ({ ...page, total })),
      nativeId: null,
    })
  }
  return collection(await loadMainState(preset.mainId, (state) => previous?.(collection(state))))
}

export async function loadAllIconImages(
  preset: Preset,
  previous?: (images: string[]) => void,
): Promise<string[]> {
  const idsFromState = (state: NonNullable<ReturnType<typeof readMain>["state"]>) =>
    [...state.slaves]
      .filter((slave) => slave.articleId !== null)
      .sort((a, b) => a.page - b.page)
      .map((slave) => slave.articleId!)
  const publishSnapshot = async (ids: number[]) => {
    const records = await Promise.all(
      ids.map((id) => readIconCache<string[]>(nativeKey(id), validateImages)),
    )
    if (records.some((record) => record !== undefined))
      previous?.(records.flatMap((record) => record?.value ?? []))
  }
  let ids = [preset.id]
  if (preset.mainId !== null) {
    const record = await readIconCache<NonNullable<ReturnType<typeof readMain>["state"]>>(
      `main:${iconBoardId}:${preset.mainId}`,
      validateState,
    )
    if (record) await publishSnapshot(idsFromState(record.value))
    ids = idsFromState(await loadMainState(preset.mainId))
  }
  await publishSnapshot(ids)
  const images: string[] = []
  for (const id of ids) images.push(...(await loadNativeImages(id)))
  return images
}
