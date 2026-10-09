import { Check, ChevronLeft, ChevronRight, type IconNode, SquareOff, Star, Trash2, X } from "lucide"
import { createPortal, createRef, h, render as renderView, type Ref } from "preact"
import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "preact/hooks"

import {
  loadCollection,
  loadNativePage,
  loadPresets,
  type IconCollection,
  type Preset,
} from "../lib/icon-view.ts"
import { matchesPreset } from "../lib/preset-search.ts"
import { mobileDomain } from "../lib/ruli-constants.ts"

import "./comment-icon.css"

type Mode = "all" | "favorites" | "recent"
type Saved = {
  presetId: number | null
  favorites: string[]
  recent: string[]
  editMode: boolean
  prioritizeRecent: boolean
}
type UpdateSaved = (update: (current: Saved) => Saved) => void
type DialogRequest = {
  presets: Preset[]
  selected: number | null
  opener: HTMLElement
  choose: (preset: Preset) => void
}
type AppHandle = { open: (container: HTMLElement) => void }
type DialogState = DialogRequest & { open: boolean }
const storageKey = "ruricon:icon-view:v1"
const localIconLimit = 1000
const appRef = createRef<AppHandle>()
const ownedContainers = new Set<HTMLElement>()
let appRoot: HTMLElement | null = null

function readPreferences(): Saved {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) ?? "null")
    const urls = (value: unknown): string[] =>
      Array.isArray(value)
        ? value.filter(
            (src): src is string =>
              typeof src === "string" && /^https?:\/\//i.test(src) && URL.canParse(src),
          )
        : []
    return {
      presetId: Number.isSafeInteger(value?.presetId) && value.presetId > 0 ? value.presetId : null,
      favorites: [...new Set(urls(value?.favorites))].slice(0, localIconLimit),
      recent: [...new Set(urls(value?.recent))].slice(0, localIconLimit),
      editMode: value?.editMode === true,
      prioritizeRecent:
        typeof value?.prioritizeRecent === "boolean" ? value.prioritizeRecent : true,
    }
  } catch {
    return { presetId: null, favorites: [], recent: [], editMode: false, prioritizeRecent: true }
  }
}

function CommentIconApp({ ref }: { ref: Ref<AppHandle> }) {
  const [views, setViews] = useState<{ container: HTMLElement; visible: boolean }[]>([])
  const [saved, setSaved] = useState(readPreferences)
  const [storageError, setStorageError] = useState<string | null>(null)
  const [dialog, setDialog] = useState<DialogState | null>(null)
  const persisted = useRef(saved)

  useImperativeHandle(
    ref,
    () => ({
      open(container) {
        setViews((current) =>
          current.some((view) => view.container === container)
            ? current.map((view) =>
                view.container === container ? { ...view, visible: !view.visible } : view,
              )
            : [...current, { container, visible: true }],
        )
      },
    }),
    [],
  )

  useLayoutEffect(() => {
    if (persisted.current === saved) return
    persisted.current = saved
    try {
      localStorage.setItem(storageKey, JSON.stringify(saved))
      setStorageError(null)
    } catch {
      setStorageError("사용 기록을 저장할 수 없습니다. 현재 화면에서는 유지됩니다.")
    }
  }, [saved])

  return (
    <>
      {views.map((view, index) => (
        <IconView
          key={index}
          {...view}
          saved={saved}
          updateSaved={setSaved}
          storageError={storageError}
          choosePreset={(request) => setDialog({ ...request, open: true })}
        />
      ))}
      {dialog && (
        <PresetDialog
          request={dialog}
          dismiss={() =>
            setDialog((current) =>
              current === dialog && current.open ? { ...current, open: false } : current,
            )
          }
        />
      )}
    </>
  )
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

function PresetDialog({ request, dismiss }: { request: DialogState; dismiss: () => void }) {
  const [query, setQuery] = useState("")
  const modal = useRef<HTMLDialogElement>(null)
  const search = useRef<HTMLInputElement>(null)
  const filtered = request.presets.filter((preset) => matchesPreset(preset.title, query))

  useLayoutEffect(() => {
    if (!request.open) return
    const dialog = modal.current!
    setQuery("")
    request.opener.focus()
    dialog.showModal()
    search.current!.focus()
    return () => {
      dialog.close()
      request.opener.focus()
    }
  }, [request])

  return (
    <dialog
      ref={modal}
      class="ruricon-preset-dialog"
      aria-labelledby="ruricon-preset-title"
      onClose={() => {
        if (!modal.current?.open) dismiss()
      }}
    >
      <div class="ruricon-preset-heading">
        <strong id="ruricon-preset-title">프리셋 선택</strong>
        <button type="button" onClick={dismiss}>
          닫기
        </button>
      </div>
      <input
        ref={search}
        type="search"
        placeholder="프리셋 이름 검색…"
        aria-label="프리셋 이름 검색"
        value={query}
        onInput={(event) => setQuery(event.currentTarget.value)}
      />
      <div class="ruricon-preset-list">
        {filtered.map((preset) => (
          <button
            key={preset.id}
            type="button"
            aria-current={preset.id === request.selected ? "true" : undefined}
            onClick={() => {
              dismiss()
              request.choose(preset)
            }}
          >
            <PresetLabel
              preset={preset}
              text={`${preset.id === request.selected ? "✓ " : ""}${preset.title}${preset.imageCount === undefined ? "" : ` · ${preset.imageCount}개`}`}
            />
          </button>
        ))}
        {!filtered.length &&
          (request.presets.length
            ? "검색 결과가 없습니다."
            : "등록된 아이콘팩 즐겨찾기가 없습니다.")}
      </div>
    </dialog>
  )
}

function PresetShortcuts({
  presets,
  selected,
  visible,
  choose,
}: {
  presets: Preset[]
  selected: number | null
  visible: boolean
  choose: (preset: Preset) => void
}) {
  const mobile = location.hostname === mobileDomain
  const strip = useRef<HTMLDivElement>(null)
  const [layout, setLayout] = useState({ page: 0, capacity: 1 })
  const pageCount = Math.ceil(presets.length / layout.capacity)
  const page = Math.max(0, Math.min(layout.page, Math.max(0, pageCount - 1)))
  const items = mobile
    ? presets
    : presets.slice(page * layout.capacity, (page + 1) * layout.capacity)

  function capacity() {
    const element = strip.current!
    const style = getComputedStyle(element)
    const size = parseFloat(style.getPropertyValue("--ruricon-preset-shortcut-size"))
    const gap = parseFloat(style.columnGap)
    return Math.max(1, Math.floor((element.clientWidth + gap) / (size + gap)))
  }

  useLayoutEffect(() => {
    if (mobile || !visible) return
    const measure = () => {
      const count = capacity()
      setLayout((current) =>
        count === current.capacity
          ? current
          : {
              capacity: count,
              page: Math.floor((current.page * current.capacity) / count),
            },
      )
    }
    measure()
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null
    observer?.observe(strip.current!)
    return () => observer?.disconnect()
  }, [visible, mobile, presets.length])

  useLayoutEffect(() => {
    setLayout((current) => ({
      ...current,
      page: Math.floor(
        Math.max(
          0,
          presets.findIndex((preset) => preset.id === selected),
        ) / current.capacity,
      ),
    }))
  }, [selected])

  function move(delta: number) {
    const count = capacity()
    setLayout((current) => {
      const currentPage = Math.floor((page * current.capacity) / count)
      return {
        capacity: count,
        page: Math.max(
          0,
          Math.min(currentPage + delta, Math.max(0, Math.ceil(presets.length / count) - 1)),
        ),
      }
    })
  }

  return (
    <nav class="ruricon-preset-shortcuts" aria-label="프리셋 단축 선택" hidden={!presets.length}>
      {!mobile && (
        <button
          type="button"
          class="ruricon-preset-arrow"
          aria-label="이전 프리셋 페이지"
          disabled={page === 0}
          onClick={() => move(-1)}
        >
          <Icon node={ChevronLeft} size={20} />
        </button>
      )}
      <div ref={strip} class="ruricon-preset-strip" data-mobile={String(mobile)}>
        {items.map((preset) => (
          <button
            key={preset.id}
            type="button"
            class="ruricon-preset-shortcut"
            data-preset-id={preset.id}
            title={preset.title}
            aria-label={preset.title}
            aria-pressed={preset.id === selected}
            onClick={() => choose(preset)}
          >
            <PresetLabel text={preset.title} preset={preset} />
          </button>
        ))}
      </div>
      {!mobile && (
        <button
          type="button"
          class="ruricon-preset-arrow"
          aria-label="다음 프리셋 페이지"
          disabled={page >= pageCount - 1}
          onClick={() => move(1)}
        >
          <Icon node={ChevronRight} size={20} />
        </button>
      )}
    </nav>
  )
}

function IconTile({
  src,
  index,
  favorite,
  recent,
  insert,
  setFavorite,
}: {
  src: string
  index: number
  favorite: boolean
  recent: boolean
  insert: (image: HTMLImageElement, src: string) => Promise<void>
  setFavorite: (src: string, favorite: boolean) => void
}) {
  const image = useRef<HTMLImageElement>(null)
  return (
    <div class="ruricon-icon-tile" data-favorite={String(favorite)} data-recent={String(recent)}>
      <button
        type="button"
        class="ruricon-icon-insert"
        aria-label={`아이콘 ${index + 1} 삽입`}
        onClick={() => {
          void insert(image.current!, src)
        }}
      >
        <img
          ref={image}
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
        aria-pressed={favorite}
        onClick={() => setFavorite(src, !favorite)}
      >
        <Icon node={Star} size={16} filled={favorite} />
      </button>
    </div>
  )
}

function IconView({
  container,
  visible,
  saved,
  updateSaved,
  storageError,
  choosePreset,
}: {
  container: HTMLElement
  visible: boolean
  saved: Saved
  updateSaved: UpdateSaved
  storageError: string | null
  choosePreset: (request: DialogRequest) => void
}) {
  const [presets, setPresets] = useState<Preset[]>([])
  const [selected, setSelected] = useState<Preset | null>(null)
  const [collection, setCollection] = useState<IconCollection | null>(null)
  const [mode, setMode] = useState<Mode>("all")
  const { editMode } = saved
  const [pageIndex, setPageIndex] = useState(0)
  const [nativePages, setNativePages] = useState(new Map<number, string[]>())
  const [ready, setReady] = useState(false)
  const [loading, setLoading] = useState<{
    busy: boolean
    message: string
    retry: (() => Promise<void>) | null
  }>({ busy: true, message: "불러오는 중…", retry: null })
  const revision = useRef(0)
  const alive = useRef(true)
  const grid = useRef<HTMLDivElement>(null)
  const pages = useRef<HTMLElement>(null)
  const select = useRef<HTMLButtonElement>(null)
  const reorderedFocus = useRef<HTMLElement | null>(null)
  const local = mode === "favorites" ? saved.favorites : saved.recent
  const total = mode === "all" ? (collection?.pages[0]?.total ?? 0) : local.length
  const pageCount =
    mode !== "all"
      ? 0
      : collection?.nativeId === null
        ? collection.pages.length
        : Math.ceil(total / 100)
  const index = Math.max(0, Math.min(pageIndex, Math.max(0, pageCount - 1)))
  const images =
    mode !== "all"
      ? local
      : collection?.nativeId === null
        ? (collection.pages[index]?.images ?? [])
        : (nativePages.get(index) ?? [])
  const favorites = new Set(saved.favorites)
  const setImages = new Set(
    collection?.nativeId === null
      ? collection.pages.flatMap((page) => page.images)
      : [...nativePages.values()].flat(),
  )
  const recent = new Map(
    saved.recent
      .filter((src) => setImages.has(src))
      .slice(0, 10)
      .map((src, index) => [src, index]),
  )
  const orderedImages =
    mode === "all"
      ? [...images].sort(
          (a, b) =>
            Number(favorites.has(b)) - Number(favorites.has(a)) ||
            (favorites.has(a) || !saved.prioritizeRecent
              ? 0
              : (recent.get(a) ?? 10) - (recent.get(b) ?? 10)),
        )
      : images

  useLayoutEffect(() => {
    container.hidden = !visible
    container.style.display = visible ? "block" : "none"
  }, [container, visible])

  useLayoutEffect(() => {
    grid.current?.scrollTo({ top: 0, behavior: "instant" })
  }, [selected?.id, mode, index])

  useLayoutEffect(() => {
    if (reorderedFocus.current) {
      const focused = reorderedFocus.current
      reorderedFocus.current = null
      if (focused.isConnected) focused.focus({ preventScroll: true })
    }
    if (document.activeElement?.parentElement === pages.current)
      pages.current?.querySelector<HTMLButtonElement>('[aria-current="page"]')?.focus()
  })

  useEffect(() => {
    void initialize()
    return () => {
      alive.current = false
      revision.current++
    }
  }, [])

  async function request<T>(
    action: () => Promise<T>,
    apply: (result: T) => void,
    again: () => Promise<void>,
  ): Promise<boolean> {
    const token = ++revision.current
    setLoading({ busy: true, message: "불러오는 중…", retry: null })
    try {
      const result = await action()
      if (!alive.current || token !== revision.current) return false
      apply(result)
      setLoading({ busy: false, message: "", retry: null })
      return true
    } catch (error) {
      if (alive.current && token === revision.current)
        setLoading({
          busy: false,
          message: error instanceof Error ? error.message : "아이콘을 불러오지 못했습니다.",
          retry: again,
        })
      return false
    }
  }

  async function selectPreset(preset: Preset) {
    setSelected(preset)
    setMode("all")
    setPageIndex(0)
    setCollection(null)
    setNativePages(new Map())
    await request(
      () => loadCollection(preset),
      (result) => {
        const loaded = { ...preset, imageCount: result.pages[0]?.total ?? 0 }
        setCollection(result)
        setSelected(loaded)
        setPresets((current) => current.map((item) => (item.id === preset.id ? loaded : item)))
        setNativePages(new Map([[0, result.pages[0]?.images ?? []]]))
        updateSaved((current) => ({ ...current, presetId: preset.id }))
      },
      () => selectPreset(preset),
    )
  }

  async function changePage(next: number) {
    setPageIndex(next)
    if (mode !== "all" || !collection?.nativeId || nativePages.has(next)) {
      revision.current++
      setLoading({ busy: false, message: "", retry: null })
      return
    }
    const id = collection.nativeId
    await request(
      () => loadNativePage(id, next * 100),
      (result) => {
        setNativePages((current) => new Map(current).set(next, result.images))
      },
      () => changePage(next),
    )
  }

  async function initialize() {
    let initial: Preset | undefined
    const success = await request(
      loadPresets,
      (result) => {
        setPresets(result)
        setReady(true)
        initial = result.find((preset) => preset.id === saved.presetId) ?? result[0]
      },
      initialize,
    )
    if (success && initial) await selectPreset(initial)
  }

  function changeMode(next: Mode) {
    revision.current++
    setMode(next)
    setPageIndex(0)
    setLoading({ busy: false, message: "", retry: null })
    if (next === "all" && selected && !collection) void selectPreset(selected)
  }

  function preserveReorderFocus() {
    const focused = document.activeElement
    if (focused instanceof HTMLElement && grid.current?.contains(focused)) {
      // Moving a focused icon makes the browser scroll it into view.
      reorderedFocus.current = focused
      focused.blur()
    }
  }

  function setFavorite(src: string, favorite: boolean) {
    if (favorite && !saved.favorites.includes(src) && saved.favorites.length >= localIconLimit) {
      setLoading((current) => ({
        ...current,
        message: `즐겨찾기는 최대 ${localIconLimit}개까지 저장할 수 있습니다.`,
      }))
      return
    }
    preserveReorderFocus()
    updateSaved((current) => {
      if (current.favorites.includes(src) === favorite) return current
      if (favorite && current.favorites.length >= localIconLimit) return current
      return {
        ...current,
        favorites: favorite
          ? [...current.favorites, src]
          : current.favorites.filter((url) => url !== src),
      }
    })
  }

  async function insertIcon(image: HTMLImageElement, src: string) {
    try {
      const wrapper = image.closest(".common_write_wrapper")
      if (!wrapper || typeof window.app?.select_icon !== "function")
        throw new Error("댓글 입력창을 찾을 수 없습니다.")
      await window.app.select_icon(image)
      if (!alive.current) return
      if (
        !Array.from(
          wrapper.querySelectorAll<HTMLImageElement | HTMLVideoElement>(".icon_preview"),
        ).some((preview) => preview.src === image.src)
      )
        throw new Error("아이콘 미리보기를 만들지 못했습니다. 기본 아이콘 기능을 확인해주세요.")
      preserveReorderFocus()
      updateSaved((current) => ({
        ...current,
        recent: [src, ...current.recent.filter((url) => url !== src)].slice(0, localIconLimit),
      }))
      setLoading((current) => ({ ...current, message: "" }))
    } catch (error) {
      if (alive.current)
        setLoading((current) => ({
          ...current,
          message: error instanceof Error ? error.message : "아이콘을 삽입하지 못했습니다.",
        }))
    }
  }

  return createPortal(
    <section
      class="ruricon-icon-view"
      data-edit-mode={String(editMode)}
      aria-label="아이콘 선택"
      aria-busy={loading.busy}
    >
      <strong>아이콘 선택</strong>
      <button
        ref={select}
        type="button"
        class="ruricon-preset-select"
        disabled={!ready}
        onClick={() =>
          choosePreset({
            presets,
            selected: selected?.id ?? null,
            opener: select.current!,
            choose: (preset) => {
              void selectPreset(preset)
            },
          })
        }
      >
        <PresetLabel
          preset={selected}
          text={
            !ready
              ? "프리셋 불러오는 중…"
              : collection
                ? `${collection.title} · ${collection.pages[0]?.total ?? 0}개 · 프리셋 변경 ▾`
                : (selected?.title ?? "프리셋 선택 ▾")
          }
        />
      </button>
      <PresetShortcuts
        presets={presets}
        selected={selected?.id ?? null}
        visible={visible}
        choose={(preset) => {
          void selectPreset(preset)
        }}
      />
      <div class="ruricon-icon-toolbar" data-mobile={String(location.hostname === mobileDomain)}>
        <div class="ruricon-icon-tabs">
          {(
            [
              ["all", "전체"],
              ["favorites", "★ 즐겨찾기"],
              ["recent", "최근 사용"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={value === mode}
              disabled={loading.busy && !ready}
              onClick={() => changeMode(value)}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            class="ruricon-icon-clear-recent"
            hidden={mode !== "recent"}
            disabled={!saved.recent.length}
            aria-label="최근 사용 기록 삭제"
            title="최근 사용 기록 삭제"
            onClick={() => updateSaved((current) => ({ ...current, recent: [] }))}
          >
            <Icon node={Trash2} size={16} />
          </button>
        </div>
        <nav
          ref={pages}
          class="ruricon-icon-pages"
          aria-label="아이콘 페이지"
          hidden={mode !== "all"}
        >
          {Array.from({ length: pageCount }, (_, page) => {
            const number = collection?.nativeId === null ? collection.pages[page].number : page + 1
            return (
              <button
                key={number}
                type="button"
                aria-label={`${number}페이지`}
                aria-current={page === index ? "page" : undefined}
                onClick={() => {
                  void changePage(page)
                }}
              >
                {number}
              </button>
            )
          })}
        </nav>
        <button
          type="button"
          class="ruricon-icon-edit-mode"
          hidden={mode !== "favorites"}
          aria-pressed={editMode}
          onClick={() => updateSaved((current) => ({ ...current, editMode: !current.editMode }))}
        >
          <Icon node={Star} size={16} filled={editMode} />
          편집 모드
        </button>
        <button
          type="button"
          class="ruricon-icon-prioritize-recent"
          hidden={mode !== "recent"}
          aria-pressed={saved.prioritizeRecent}
          title="전체 탭에서 최근 사용 아이콘 우선 정렬"
          onClick={() =>
            updateSaved((current) => ({ ...current, prioritizeRecent: !current.prioritizeRecent }))
          }
        >
          <Icon node={saved.prioritizeRecent ? Check : X} size={16} />
          우선 정렬
        </button>
      </div>
      <div role="status">{[loading.message, storageError].filter(Boolean).join(" ")}</div>
      <button
        type="button"
        hidden={!loading.retry}
        onClick={() => {
          void loading.retry?.()
        }}
      >
        다시 시도
      </button>
      <div ref={grid} class="ruricon-icon-grid" aria-label="아이콘 목록">
        {orderedImages.map((src, position) => (
          <IconTile
            key={src}
            src={src}
            index={position}
            favorite={favorites.has(src)}
            recent={mode === "all" && recent.has(src)}
            insert={insertIcon}
            setFavorite={setFavorite}
          />
        ))}
        {!images.length && !loading.busy && (
          <div class="ruricon-icon-empty" role="img" aria-label="표시할 아이콘이 없습니다.">
            <Icon node={SquareOff} size={32} />
          </div>
        )}
      </div>
    </section>,
    container,
  )
}

export function openRuriconIconView(container: HTMLElement) {
  if (!appRoot) {
    appRoot = document.createElement("div")
    document.body.append(appRoot)
    renderView(<CommentIconApp ref={appRef} />, appRoot)
  }
  if (!ownedContainers.has(container)) {
    container.replaceChildren()
    ownedContainers.add(container)
  }
  appRef.current!.open(container)
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
    if (appRoot) {
      renderView(null, appRoot)
      appRoot.remove()
      appRoot = null
    }
    ownedContainers.clear()
  }
}
