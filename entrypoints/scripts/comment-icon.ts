import {
  loadCollection,
  loadNativePage,
  loadPresets,
  type IconCollection,
  type Preset,
} from "../lib/icon-view.ts"

import "./comment-icon.css"

type Mode = "all" | "favorites" | "recent"
type Saved = { presetId: number | null; favorites: string[]; recent: string[] }
const storageKey = "ruricon:icon-view:v1"
const views = new Map<HTMLElement, { toggle: () => void; destroy: () => void }>()
let dialog: HTMLDialogElement | null = null
let saved: Saved | null = null

function preferences(): Saved {
  if (saved) return saved
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) ?? "null")
    const urls = (value: unknown): string[] =>
      Array.isArray(value)
        ? value.filter(
            (src): src is string =>
              typeof src === "string" && /^https?:\/\//i.test(src) && URL.canParse(src),
          )
        : []
    saved = {
      presetId: Number.isSafeInteger(value?.presetId) && value.presetId > 0 ? value.presetId : null,
      favorites: [...new Set(urls(value?.favorites))],
      recent: [...new Set(urls(value?.recent))].slice(0, 100),
    }
  } catch {
    saved = { presetId: null, favorites: [], recent: [] }
  }
  return saved
}

function persist(status: HTMLElement) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(preferences()))
  } catch {
    status.textContent = "사용 기록을 저장할 수 없습니다. 현재 화면에서는 유지됩니다."
  }
}

function button(text: string, click: () => void) {
  const element = document.createElement("button")
  element.type = "button"
  element.textContent = text
  element.addEventListener("click", click)
  return element
}

function choosePreset(
  presets: Preset[],
  selected: number | null,
  opener: HTMLElement,
  choose: (preset: Preset) => void,
) {
  if (dialog?.open) dialog.close()
  if (!dialog) {
    dialog = document.createElement("dialog")
    dialog.className = "ruricon-preset-dialog"
    document.body.append(dialog)
  }
  const modal = dialog
  const heading = document.createElement("div")
  heading.className = "ruricon-preset-heading"
  const title = document.createElement("strong")
  title.id = "ruricon-preset-title"
  title.textContent = "프리셋 선택"
  modal.setAttribute("aria-labelledby", title.id)
  heading.append(
    title,
    button("닫기", () => modal.close()),
  )
  const search = document.createElement("input")
  search.type = "search"
  search.placeholder = "프리셋 이름 검색…"
  search.setAttribute("aria-label", "프리셋 이름 검색")
  const list = document.createElement("div")
  list.className = "ruricon-preset-list"
  const render = () => {
    list.replaceChildren()
    for (const preset of presets.filter((preset) =>
      preset.title.toLocaleLowerCase().includes(search.value.toLocaleLowerCase()),
    )) {
      const row = button(
        `${preset.id === selected ? "✓ " : ""}${preset.title}${preset.imageCount === undefined ? "" : ` · ${preset.imageCount}개`}`,
        () => {
          modal.close()
          choose(preset)
        },
      )
      if (preset.id === selected) row.setAttribute("aria-current", "true")
      list.append(row)
    }
    if (!list.children.length)
      list.textContent = presets.length
        ? "검색 결과가 없습니다."
        : "등록된 아이콘팩 즐겨찾기가 없습니다."
  }
  search.addEventListener("input", render)
  modal.addEventListener(
    "close",
    () => {
      search.value = ""
      if (!modal.open) opener.focus()
    },
    { once: true },
  )
  modal.replaceChildren(heading, search, list)
  render()
  modal.showModal()
  search.focus()
}

export function openRuriconIconView(container: HTMLElement) {
  const existing = views.get(container)
  if (existing) {
    existing.toggle()
    return
  }
  const panel = document.createElement("section")
  panel.className = "ruricon-icon-view"
  panel.setAttribute("aria-label", "아이콘 선택")
  const heading = document.createElement("strong")
  heading.textContent = "아이콘 선택"
  const status = document.createElement("div")
  status.setAttribute("role", "status")
  const retry = button("다시 시도", () => {
    void retryAction()
  })
  retry.hidden = true
  let presets: Preset[] = []
  let selected: Preset | null = null
  let collection: IconCollection | null = null
  let mode: Mode = "all"
  let pageIndex = 0
  let nativePages = new Map<number, string[]>()
  let revision = 0
  let disposed = false
  let busy = false
  let retryAction: () => Promise<void> = async () => {}
  const select = button("프리셋 불러오는 중…", () =>
    choosePreset(presets, selected?.id ?? null, select, (preset) => {
      void selectPreset(preset)
    }),
  )
  select.className = "ruricon-preset-select"
  select.disabled = true
  const tabs = document.createElement("div")
  tabs.className = "ruricon-icon-tabs"
  const tabButtons = (
    [
      ["all", "전체"],
      ["favorites", "★ 즐겨찾기"],
      ["recent", "최근 사용"],
    ] as const
  ).map(([value, label]) => {
    const tab = button(label, () => {
      revision++
      busy = false
      mode = value
      pageIndex = 0
      status.textContent = ""
      retry.hidden = true
      render()
      if (mode === "all" && selected && !collection) void selectPreset(selected)
    })
    tabs.append(tab)
    return { value, tab }
  })
  const pages = document.createElement("nav")
  pages.className = "ruricon-icon-pages"
  pages.setAttribute("aria-label", "아이콘 페이지")
  const count = document.createElement("div")
  count.className = "ruricon-icon-count"
  const grid = document.createElement("div")
  grid.className = "ruricon-icon-grid"
  grid.setAttribute("aria-label", "아이콘 목록")
  panel.append(heading, select, tabs, pages, count, status, retry, grid)
  container.replaceChildren(panel)
  container.hidden = false
  container.style.display = "block"

  function render() {
    const focusPage = document.activeElement?.parentElement === pages
    const prefs = preferences()
    for (const { value, tab } of tabButtons) {
      tab.setAttribute("aria-pressed", String(value === mode))
      tab.disabled = busy && select.disabled
    }
    const local = mode === "favorites" ? prefs.favorites : prefs.recent
    const total = mode === "all" ? (collection?.pages[0]?.total ?? 0) : local.length
    const pageCount =
      mode === "all" && collection?.nativeId === null
        ? collection.pages.length
        : Math.ceil(total / 100)
    pageIndex = Math.max(0, Math.min(pageIndex, Math.max(0, pageCount - 1)))
    const images =
      mode !== "all"
        ? local.slice(pageIndex * 100, (pageIndex + 1) * 100)
        : collection?.nativeId !== null
          ? (nativePages.get(pageIndex) ?? [])
          : (collection.pages[pageIndex]?.images ?? [])
    select.textContent = collection
      ? `${collection.title} · ${collection.pages[0]?.total ?? 0}개 · 프리셋 변경 ▾`
      : (selected?.title ?? "프리셋 선택 ▾")
    pages.replaceChildren()
    for (let index = 0; index < pageCount; index++) {
      const number =
        mode === "all" && collection?.nativeId === null ? collection.pages[index].number : index + 1
      const pageButton = button(String(number), () => {
        void changePage(index)
      })
      pageButton.setAttribute("aria-label", `${number}페이지`)
      if (index === pageIndex) pageButton.setAttribute("aria-current", "page")
      pages.append(pageButton)
    }
    count.textContent = `${mode === "all" ? "아이콘 목록" : mode === "favorites" ? "즐겨찾기" : "최근 사용"} · ${total}개${pageCount ? ` · ${images.length}개 표시` : ""}`
    panel.setAttribute("aria-busy", String(busy))
    grid.replaceChildren()
    for (const [index, src] of images.entries()) {
      const tile = document.createElement("div")
      tile.className = "ruricon-icon-tile"
      const image = document.createElement("img")
      image.src = src
      image.alt = `아이콘 ${index + 1}`
      image.loading = "lazy"
      const insert = button("", async () => {
        try {
          const wrapper = image.closest(".common_write_wrapper")
          if (!wrapper || typeof window.app?.select_icon !== "function")
            throw new Error("댓글 입력창을 찾을 수 없습니다.")
          await window.app.select_icon(image)
          if (
            !Array.from(
              wrapper.querySelectorAll<HTMLImageElement | HTMLVideoElement>(".icon_preview"),
            ).some((preview) => preview.src === image.src)
          )
            throw new Error("아이콘 미리보기를 만들지 못했습니다. 기본 아이콘 기능을 확인해주세요.")
          prefs.recent = [src, ...prefs.recent.filter((url) => url !== src)].slice(0, 100)
          status.textContent = "아이콘을 댓글 입력창에 전달했습니다."
          persist(status)
          if (mode === "recent") render()
        } catch (error) {
          status.textContent =
            error instanceof Error ? error.message : "아이콘을 삽입하지 못했습니다."
        }
      })
      insert.className = "ruricon-icon-insert"
      insert.setAttribute("aria-label", `아이콘 ${index + 1} 삽입`)
      insert.append(image)
      if (src.includes(".mp4")) {
        image.style.display = "none"
        const video = document.createElement("video")
        video.src = src
        video.preload = "metadata"
        video.muted = true
        video.playsInline = true
        video.setAttribute("aria-hidden", "true")
        insert.append(video)
      }
      const favorite = button(prefs.favorites.includes(src) ? "★" : "☆", () => {
        prefs.favorites = prefs.favorites.includes(src)
          ? prefs.favorites.filter((url) => url !== src)
          : [...prefs.favorites, src]
        persist(status)
        render()
      })
      favorite.className = "ruricon-icon-star"
      favorite.setAttribute("aria-label", "즐겨찾기 추가/제거")
      favorite.setAttribute("aria-pressed", String(prefs.favorites.includes(src)))
      tile.append(insert, favorite)
      grid.append(tile)
    }
    if (!images.length && !busy) grid.textContent = "표시할 아이콘이 없습니다."
    grid.scrollTop = 0
    if (focusPage) pages.querySelector<HTMLButtonElement>('[aria-current="page"]')?.focus()
  }

  async function request(
    action: () => Promise<void>,
    apply: () => void,
    again: () => Promise<void>,
  ) {
    const token = ++revision
    busy = true
    status.textContent = "불러오는 중…"
    retry.hidden = true
    render()
    try {
      await action()
      if (disposed || token !== revision) return
      status.textContent = ""
      apply()
    } catch (error) {
      if (disposed || token !== revision) return
      status.textContent = error instanceof Error ? error.message : "아이콘을 불러오지 못했습니다."
      retryAction = again
      retry.hidden = false
    }
    if (disposed || token !== revision) return
    busy = false
    render()
  }

  async function selectPreset(preset: Preset) {
    selected = preset
    mode = "all"
    pageIndex = 0
    collection = null
    nativePages = new Map()
    let result: IconCollection
    await request(
      async () => {
        result = await loadCollection(preset)
      },
      () => {
        collection = result
        preset.imageCount = result.pages[0]?.total ?? 0
        nativePages.set(0, result.pages[0]?.images ?? [])
        preferences().presetId = preset.id
        persist(status)
      },
      () => selectPreset(preset),
    )
  }

  async function changePage(index: number) {
    pageIndex = index
    if (mode !== "all" || !collection?.nativeId || nativePages.has(index)) {
      revision++
      busy = false
      status.textContent = ""
      retry.hidden = true
      render()
      return
    }
    const id = collection.nativeId
    let images: string[]
    await request(
      async () => {
        images = (await loadNativePage(id, index * 100)).images
      },
      () => {
        nativePages.set(index, images)
      },
      () => changePage(index),
    )
  }

  async function initialize() {
    let result: Preset[]
    await request(
      async () => {
        result = await loadPresets()
      },
      () => {
        presets = result
        select.disabled = false
      },
      initialize,
    )
    if (!disposed && presets.length && !selected)
      await selectPreset(
        presets.find((preset) => preset.id === preferences().presetId) ?? presets[0],
      )
  }
  views.set(container, {
    toggle: () => {
      container.hidden = !container.hidden
      container.style.display = container.hidden ? "none" : "block"
      if (!container.hidden) render()
    },
    destroy: () => {
      disposed = true
      revision++
      panel.remove()
      views.delete(container)
    },
  })
  void initialize()
}

export function mountCommentIconHook() {
  const onClick = (event: MouseEvent) => {
    if (!(event.target instanceof Element)) return
    const nativeButton = event.target.closest<HTMLElement>(
      '.comment_icon_button, [onclick*="app.comment_icon("], [onclick*="app.comment_icon_toggle("]',
    )
    if (!nativeButton) return
    const wrapper = nativeButton.closest(".common_write_wrapper")
    const container =
      nativeButton.parentElement?.querySelector<HTMLElement>(".comment_icon") ??
      wrapper?.querySelector<HTMLElement>(".comment_icon")
    if (
      !container ||
      !wrapper ||
      container.closest(".common_write_wrapper") !== wrapper ||
      !wrapper.querySelector(".common_input_wrapper") ||
      wrapper.id === "editor_common_write_wrapper" ||
      typeof window.app?.select_icon !== "function" ||
      typeof HTMLDialogElement === "undefined"
    )
      return
    openRuriconIconView(container)
    event.preventDefault()
    event.stopImmediatePropagation()
  }
  document.addEventListener("click", onClick, true)
  return () => {
    document.removeEventListener("click", onClick, true)
    for (const view of views.values()) view.destroy()
    dialog?.remove()
    dialog = null
  }
}
