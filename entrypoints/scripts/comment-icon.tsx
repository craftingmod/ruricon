import { ChevronLeft, ChevronRight, type IconNode, Star } from "lucide"
import { h, render as renderView } from "preact"

import {
  loadCollection,
  loadNativePage,
  loadPresets,
  type IconCollection,
  type Preset,
} from "../lib/icon-view.ts"

import "./comment-icon.css"
import { matchesPreset } from "../lib/preset-search.ts"
import { mobileDomain } from "../lib/ruli-constants.ts"

type Mode = "all" | "favorites" | "recent"
type Saved = { presetId: number | null; favorites: string[]; recent: string[] }
const storageKey = "ruricon:icon-view:v1"
const localIconLimit = 1000
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
      favorites: [...new Set(urls(value?.favorites))].slice(0, localIconLimit),
      recent: [...new Set(urls(value?.recent))].slice(0, localIconLimit),
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

function Icon({ node, size, filled = false }: { node: IconNode; size: number; filled?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {node.map(([tag, attrs], index) => h(tag, { ...attrs, key: index }))}
    </svg>
  )
}

function PresetLabel({ text, preset }: { text: string; preset: Preset | null }) {
  const thumbnail = preset?.thumbnail
  const valid = thumbnail && /^https?:\/\//i.test(thumbnail.src) && URL.canParse(thumbnail.src)
  return (
    <>
      {valid &&
        (thumbnail.type === "video" ? (
          <video
            class="ruricon-preset-thumbnail"
            src={thumbnail.src}
            preload="metadata"
            muted
            playsInline
            aria-hidden="true"
          />
        ) : (
          <img class="ruricon-preset-thumbnail" src={thumbnail.src} alt="" loading="lazy" />
        ))}
      <span class="ruricon-preset-label">{text}</span>
    </>
  )
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
    dialog.setAttribute("aria-labelledby", "ruricon-preset-title")
    document.body.append(dialog)
  }
  const modal = dialog
  let query = ""
  const draw = () => {
    const filtered = presets.filter((preset) => matchesPreset(preset.title, query))
    renderView(
      <>
        <div class="ruricon-preset-heading">
          <strong id="ruricon-preset-title">프리셋 선택</strong>
          <button type="button" onClick={() => modal.close()}>
            닫기
          </button>
        </div>
        <input
          type="search"
          placeholder="프리셋 이름 검색…"
          aria-label="프리셋 이름 검색"
          onInput={(event) => {
            query = event.currentTarget.value
            draw()
          }}
        />
        <div class="ruricon-preset-list">
          {filtered.map((preset) => (
            <button
              key={preset.id}
              type="button"
              aria-current={preset.id === selected ? "true" : undefined}
              onClick={() => {
                modal.close()
                choose(preset)
              }}
            >
              <PresetLabel
                preset={preset}
                text={`${preset.id === selected ? "✓ " : ""}${preset.title}${preset.imageCount === undefined ? "" : ` · ${preset.imageCount}개`}`}
              />
            </button>
          ))}
          {!filtered.length &&
            (presets.length ? "검색 결과가 없습니다." : "등록된 아이콘팩 즐겨찾기가 없습니다.")}
        </div>
      </>,
      modal,
    )
  }
  modal.onclose = () => {
    if (!modal.open) {
      modal.querySelector<HTMLInputElement>("input")!.value = ""
      opener.focus()
    }
  }
  draw()
  modal.querySelector<HTMLInputElement>("input")!.value = ""
  opener.focus()
  modal.showModal()
  modal.querySelector<HTMLInputElement>("input")!.focus()
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
  const mobile = location.hostname === mobileDomain
  let shortcutPage = 0
  let shortcutCapacity = 1
  const shortcuts = document.createElement("nav")
  shortcuts.className = "ruricon-preset-shortcuts"
  shortcuts.setAttribute("aria-label", "프리셋 단축 선택")
  const strip = document.createElement("div")
  strip.className = "ruricon-preset-strip"
  strip.dataset.mobile = String(mobile)
  const previous = button("", () => {
    shortcutPage--
    renderShortcuts()
  })
  previous.setAttribute("aria-label", "이전 프리셋 페이지")
  renderView(<Icon node={ChevronLeft} size={20} />, previous)
  const next = button("", () => {
    shortcutPage++
    renderShortcuts()
  })
  next.setAttribute("aria-label", "다음 프리셋 페이지")
  renderView(<Icon node={ChevronRight} size={20} />, next)
  previous.className = next.className = "ruricon-preset-arrow"
  if (mobile) shortcuts.append(strip)
  else shortcuts.append(previous, strip, next)
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
      grid.scrollTop = 0
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
  panel.append(heading, select, shortcuts, tabs, pages, count, status, retry, grid)
  container.replaceChildren(panel)
  container.hidden = false
  container.style.display = "block"

  function renderShortcuts() {
    const style = getComputedStyle(strip)
    const size = parseFloat(style.getPropertyValue("--ruricon-preset-shortcut-size"))
    const gap = parseFloat(style.columnGap)
    const capacity = Math.max(1, Math.floor((strip.clientWidth + gap) / (size + gap)))
    if (capacity !== shortcutCapacity) {
      shortcutPage = Math.floor((shortcutPage * shortcutCapacity) / capacity)
      shortcutCapacity = capacity
    }
    const pageCount = Math.ceil(presets.length / shortcutCapacity)
    shortcutPage = Math.max(0, Math.min(shortcutPage, Math.max(0, pageCount - 1)))
    previous.disabled = shortcutPage === 0
    next.disabled = shortcutPage >= pageCount - 1
    shortcuts.hidden = !presets.length
    const visible = mobile
      ? presets
      : presets.slice(shortcutPage * shortcutCapacity, (shortcutPage + 1) * shortcutCapacity)
    renderView(
      <>
        {visible.map((preset) => (
          <button
            key={preset.id}
            type="button"
            class="ruricon-preset-shortcut"
            data-preset-id={preset.id}
            title={preset.title}
            aria-label={preset.title}
            aria-pressed={preset.id === selected?.id}
            onClick={() => {
              void selectPreset(preset)
            }}
          >
            <PresetLabel text={preset.title} preset={preset} />
          </button>
        ))}
      </>,
      strip,
    )
  }

  const shortcutObserver =
    !mobile && typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(() => {
          if (!disposed && !container.hidden) renderShortcuts()
        })
      : null
  shortcutObserver?.observe(strip)

  function render() {
    renderShortcuts()
    const focusPage = document.activeElement?.parentElement === pages
    const prefs = preferences()
    for (const { value, tab } of tabButtons) {
      tab.setAttribute("aria-pressed", String(value === mode))
      tab.disabled = busy && select.disabled
    }
    const local = mode === "favorites" ? prefs.favorites : prefs.recent
    const total = mode === "all" ? (collection?.pages[0]?.total ?? 0) : local.length
    const pageCount =
      mode !== "all"
        ? 0
        : collection?.nativeId === null
          ? collection.pages.length
          : Math.ceil(total / 100)
    pageIndex = Math.max(0, Math.min(pageIndex, Math.max(0, pageCount - 1)))
    const images =
      mode !== "all"
        ? local
        : collection?.nativeId !== null
          ? (nativePages.get(pageIndex) ?? [])
          : (collection.pages[pageIndex]?.images ?? [])
    renderView(
      <PresetLabel
        text={
          collection
            ? `${collection.title} · ${collection.pages[0]?.total ?? 0}개 · 프리셋 변경 ▾`
            : (selected?.title ?? "프리셋 선택 ▾")
        }
        preset={selected}
      />,
      select,
    )
    pages.hidden = mode !== "all"
    renderView(
      <>
        {Array.from({ length: pageCount }, (_, index) => {
          const number = collection?.nativeId === null ? collection.pages[index].number : index + 1
          return (
            <button
              key={number}
              type="button"
              aria-label={`${number}페이지`}
              aria-current={index === pageIndex ? "page" : undefined}
              onClick={() => {
                void changePage(index)
              }}
            >
              {number}
            </button>
          )
        })}
      </>,
      pages,
    )
    count.textContent = `${mode === "all" ? "아이콘 목록" : mode === "favorites" ? "즐겨찾기" : "최근 사용"} · ${total}개${pageCount ? ` · ${images.length}개 표시` : ""}`
    panel.setAttribute("aria-busy", String(busy))
    renderView(
      <>
        {images.map((src, index) => (
          <div key={src} class="ruricon-icon-tile">
            <button
              type="button"
              class="ruricon-icon-insert"
              aria-label={`아이콘 ${index + 1} 삽입`}
              onClick={(event) => {
                void insertIcon(event.currentTarget.querySelector("img")!, src)
              }}
            >
              <img
                src={src}
                alt={`아이콘 ${index + 1}`}
                loading="lazy"
                style={src.includes(".mp4") ? { display: "none" } : undefined}
              />
              {src.includes(".mp4") && (
                <video src={src} preload="metadata" muted playsInline aria-hidden="true" />
              )}
            </button>
            <button
              type="button"
              class="ruricon-icon-star"
              aria-label="즐겨찾기 추가/제거"
              aria-pressed={prefs.favorites.includes(src)}
              onClick={() => {
                if (!prefs.favorites.includes(src) && prefs.favorites.length >= localIconLimit) {
                  status.textContent = `즐겨찾기는 최대 ${localIconLimit}개까지 저장할 수 있습니다.`
                  return
                }
                const scrollTop = grid.scrollTop
                prefs.favorites = prefs.favorites.includes(src)
                  ? prefs.favorites.filter((url) => url !== src)
                  : [...prefs.favorites, src]
                persist(status)
                render()
                grid.scrollTop = scrollTop
              }}
            >
              <Icon node={Star} size={16} filled={prefs.favorites.includes(src)} />
            </button>
          </div>
        ))}
        {!images.length && !busy && "표시할 아이콘이 없습니다."}
      </>,
      grid,
    )
    if (focusPage) pages.querySelector<HTMLButtonElement>('[aria-current="page"]')?.focus()
  }

  async function insertIcon(image: HTMLImageElement, src: string) {
    try {
      const wrapper = image.closest(".common_write_wrapper")
      if (!wrapper || typeof window.app?.select_icon !== "function")
        throw new Error("댓글 입력창을 찾을 수 없습니다.")
      await window.app.select_icon(image)
      if (disposed) return
      if (
        !Array.from(
          wrapper.querySelectorAll<HTMLImageElement | HTMLVideoElement>(".icon_preview"),
        ).some((preview) => preview.src === image.src)
      )
        throw new Error("아이콘 미리보기를 만들지 못했습니다. 기본 아이콘 기능을 확인해주세요.")
      const prefs = preferences()
      prefs.recent = [src, ...prefs.recent.filter((url) => url !== src)].slice(0, localIconLimit)
      status.textContent = "아이콘을 댓글 입력창에 전달했습니다."
      persist(status)
      if (mode === "recent") render()
    } catch (error) {
      if (!disposed)
        status.textContent =
          error instanceof Error ? error.message : "아이콘을 삽입하지 못했습니다."
    }
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
    shortcutPage = Math.floor(Math.max(0, presets.indexOf(preset)) / shortcutCapacity)
    mode = "all"
    pageIndex = 0
    collection = null
    grid.scrollTop = 0
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
    grid.scrollTop = 0
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
      shortcutObserver?.disconnect()
      revision++
      for (const root of [select, strip, pages, grid, previous, next]) renderView(null, root)
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
    if (dialog) renderView(null, dialog)
    dialog?.remove()
    dialog = null
  }
}
