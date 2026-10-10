import {
  ArrowUp,
  ArrowUpToLine,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  List,
  Pencil,
  PencilOff,
  SquareDashed,
  SquareOff,
  Star,
  Trash2,
  X,
} from "lucide-preact"
import { createPortal, createRef, h, render as renderView, type Ref } from "preact"
import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "preact/hooks"

import {
  PresetDialog,
  PresetLabel,
  type DialogRequest,
  type DialogState,
} from "../../components/preset-dialog.tsx"
import { cx } from "../lib/cx.ts"
import {
  loadCollection,
  loadNativePage,
  loadPresets,
  orderPresets,
  removePresetFavorites,
  type IconCollection,
  type Preset,
} from "../lib/icon-view.ts"
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
type AppHandle = { open: (container: HTMLElement) => void }
const storageKey = "ruricon:icon-view:v1"
const presetFavoritesKey = "ruricon:preset-favorites:v1"
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
    return {
      presetId: null,
      favorites: [],
      recent: [],
      editMode: false,
      prioritizeRecent: true,
    }
  }
}

function readPresetFavorites(): number[] {
  try {
    const value = JSON.parse(localStorage.getItem(presetFavoritesKey) ?? "null")
    return Array.isArray(value)
      ? [
          ...new Set<number>(
            value.filter((id: unknown) => Number.isSafeInteger(id) && Number(id) > 0),
          ),
        ]
      : []
  } catch {
    return []
  }
}

function CommentIconApp({ ref }: { ref: Ref<AppHandle> }) {
  const [views, setViews] = useState<{ container: HTMLElement; visible: boolean }[]>([])
  const [saved, setSaved] = useState(readPreferences)
  const [presetFavorites, setPresetFavorites] = useState(readPresetFavorites)
  const [storageError, setStorageError] = useState<string | null>(null)
  const [dialog, setDialog] = useState<DialogState | null>(null)
  const [removedPresetIds, setRemovedPresetIds] = useState<number[]>([])
  const persisted = useRef(saved)
  const persistedPresetFavorites = useRef(presetFavorites)

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
    if (persisted.current === saved && persistedPresetFavorites.current === presetFavorites) return
    try {
      if (persisted.current !== saved) {
        persisted.current = saved
        localStorage.setItem(storageKey, JSON.stringify(saved))
      }
      if (persistedPresetFavorites.current !== presetFavorites) {
        persistedPresetFavorites.current = presetFavorites
        localStorage.setItem(presetFavoritesKey, JSON.stringify(presetFavorites))
      }
      setStorageError(null)
    } catch {
      setStorageError("사용 기록을 저장할 수 없습니다. 현재 화면에서는 유지됩니다.")
    }
  }, [saved, presetFavorites])

  return (
    <>
      {views.map((view, index) => (
        <IconView
          key={index}
          {...view}
          saved={saved}
          presetFavorites={presetFavorites}
          removedPresetIds={removedPresetIds}
          updateSaved={setSaved}
          storageError={storageError}
          choosePreset={(request) => setDialog({ ...request, open: true })}
        />
      ))}
      {dialog && (
        <PresetDialog
          request={dialog}
          presetFavorites={presetFavorites}
          removedPresetIds={removedPresetIds}
          removePreset={async (preset) => {
            await removePresetFavorites(preset)
            setRemovedPresetIds((current) => [...current, preset.id])
            setPresetFavorites((current) =>
              current.includes(preset.id) ? current.filter((id) => id !== preset.id) : current,
            )
          }}
          toggleFavorite={(id) =>
            setPresetFavorites((current) =>
              current.includes(id)
                ? current.filter((favoriteId) => favoriteId !== id)
                : [...current, id],
            )
          }
          storageError={storageError}
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

function PresetShortcuts({
  presets,
  presetFavorites,
  selected,
  visible,
  choose,
}: {
  presets: Preset[]
  presetFavorites: number[]
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
    const size = element.firstElementChild?.getBoundingClientRect().width ?? 0
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
          <ChevronLeft size={20} aria-hidden="true" focusable="false" />
        </button>
      )}
      <div ref={strip} class="ruricon-preset-strip" data-mobile={String(mobile)}>
        {items.map((preset) => (
          <button
            key={preset.id}
            type="button"
            class="ruricon-preset-shortcut"
            data-preset-id={preset.id}
            data-favorite={String(presetFavorites.includes(preset.id))}
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
          <ChevronRight size={20} aria-hidden="true" focusable="false" />
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
  moveFavoriteToFront,
  selectIcon,
  selected,
}: {
  src: string
  index: number
  favorite: boolean
  recent: boolean
  insert: (image: HTMLImageElement, src: string) => Promise<void>
  setFavorite: (src: string, favorite: boolean) => void
  moveFavoriteToFront?: (src: string) => void
  selectIcon?: (src: string) => void
  selected: boolean
}) {
  const image = useRef<HTMLImageElement>(null)
  return (
    <div class="ruricon-icon-tile" data-favorite={String(favorite)} data-recent={String(recent)}>
      <button
        type="button"
        class="ruricon-icon-insert"
        aria-label={`아이콘 ${index + 1} ${selectIcon ? "선택" : "삽입"}`}
        aria-pressed={selectIcon ? selected : undefined}
        onClick={() => {
          if (selectIcon) selectIcon(src)
          else void insert(image.current!, src)
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
      {selected && (
        <span class="ruricon-icon-selected" aria-hidden="true">
          <Check size={16} />
        </span>
      )}
      <button
        type="button"
        class="ruricon-icon-star"
        aria-label="즐겨찾기 추가/제거"
        aria-pressed={favorite}
        onClick={() => setFavorite(src, !favorite)}
      >
        <Star
          size={16}
          fill={favorite ? "currentColor" : "none"}
          aria-hidden="true"
          focusable="false"
        />
      </button>
      {moveFavoriteToFront && (
        <button
          type="button"
          class="ruricon-icon-move-first"
          aria-label="즐겨찾기 맨 앞으로 이동"
          title="즐겨찾기 맨 앞으로 이동"
          disabled={index === 0}
          onClick={() => moveFavoriteToFront(src)}
        >
          <ArrowUpToLine size={16} aria-hidden="true" focusable="false" />
        </button>
      )}
    </div>
  )
}

function IconView({
  container,
  visible,
  saved,
  presetFavorites,
  removedPresetIds,
  updateSaved,
  storageError,
  choosePreset,
}: {
  container: HTMLElement
  visible: boolean
  saved: Saved
  presetFavorites: number[]
  removedPresetIds: number[]
  updateSaved: UpdateSaved
  storageError: string | null
  choosePreset: (request: DialogRequest) => void
}) {
  const [loadedPresets, setPresets] = useState<Preset[]>([])
  const presets = orderPresets(
    loadedPresets.filter((preset) => !removedPresetIds.includes(preset.id)),
    presetFavorites,
  )
  const [selected, setSelected] = useState<Preset | null>(null)
  const [collection, setCollection] = useState<IconCollection | null>(null)
  const [mode, setMode] = useState<Mode>("all")
  const { editMode } = saved
  const [selection, setSelection] = useState(new Set<string>())
  const selectionMode = mode === "favorites" && editMode
  const selectedCount = saved.favorites.filter((src) => selection.has(src)).length
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
    setSelection((current) => (current.size ? new Set<string>() : current))
  }, [visible, mode, editMode, selected?.id])

  useLayoutEffect(() => {
    grid.current?.scrollTo({ top: 0, behavior: "instant" })
  }, [selected?.id, mode, index])

  useLayoutEffect(() => {
    if (reorderedFocus.current) {
      const focused = reorderedFocus.current
      reorderedFocus.current = null
      if (focused.isConnected) {
        const target =
          focused instanceof HTMLButtonElement && focused.disabled
            ? focused
                .closest(".ruricon-icon-tile")
                ?.querySelector<HTMLButtonElement>(".ruricon-icon-insert")
            : focused
        target?.focus({ preventScroll: true })
      }
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
        initial =
          result.find((preset) => preset.id === saved.presetId) ??
          orderPresets(result, presetFavorites)[0]
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
          ? [src, ...current.favorites]
          : current.favorites.filter((url) => url !== src),
      }
    })
  }

  function moveFavoriteToFront(src: string) {
    if (saved.favorites.indexOf(src) <= 0) return
    preserveReorderFocus()
    updateSaved((current) =>
      current.favorites.indexOf(src) <= 0
        ? current
        : {
            ...current,
            favorites: [src, ...current.favorites.filter((url) => url !== src)],
          },
    )
  }

  function selectIcon(src: string) {
    setSelection((current) => {
      const next = new Set(current)
      if (next.has(src)) next.delete(src)
      else next.add(src)
      return next
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
      data-mobile={String(location.hostname === mobileDomain)}
      data-edit-mode={String(editMode)}
      aria-label="아이콘 선택"
      aria-busy={loading.busy}
    >
      <PresetShortcuts
        presets={presets}
        presetFavorites={presetFavorites}
        selected={selected?.id ?? null}
        visible={visible}
        choose={(preset) => {
          void selectPreset(preset)
        }}
      />
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
                ? `${collection.title} - ${collection.pages[0]?.total ?? 0}개`
                : (selected?.title ?? "프리셋 선택")
          }
        />
        <ChevronRight
          class="ruricon-preset-select-arrow"
          size={20}
          aria-hidden="true"
          focusable="false"
        />
      </button>
      <div class="ruricon-icon-toolbar">
        <div class="ruricon-icon-tabs">
          {(
            [
              ["all", "전체"],
              ["favorites", "즐겨찾기"],
              ["recent", "최근 사용"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-label={label}
              title={label}
              aria-pressed={value === mode}
              disabled={loading.busy && !ready}
              onClick={() => changeMode(value)}
            >
              {value === "favorites" ? (
                <Star size={18} aria-hidden="true" focusable="false" />
              ) : value === "recent" ? (
                <Clock3 size={18} aria-hidden="true" focusable="false" />
              ) : value === "all" ? (
                <List size={18} aria-hidden="true" focusable="false" />
              ) : (
                label
              )}
            </button>
          ))}
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
        <div class="ruricon-icon-actions" hidden={mode === "all"}>
          <button
            type="button"
            class={cx("ruricon-icon-action", "ruricon-icon-edit-mode")}
            hidden={mode !== "favorites"}
            aria-pressed={editMode}
            onClick={() => updateSaved((current) => ({ ...current, editMode: !current.editMode }))}
          >
            {editMode ? (
              <Pencil size={16} aria-hidden="true" focusable="false" />
            ) : (
              <PencilOff size={16} aria-hidden="true" focusable="false" />
            )}
            편집
          </button>
          <button
            type="button"
            class={cx("ruricon-icon-action", "ruricon-icon-clear-recent")}
            hidden={mode !== "recent"}
            disabled={!saved.recent.length}
            aria-label="최근 사용 기록 삭제"
            title="최근 사용 기록 삭제"
            onClick={() => {
              if (window.confirm("최근 사용 기록을 모두 삭제하시겠습니까?"))
                updateSaved((current) => ({ ...current, recent: [] }))
            }}
          >
            <Trash2 size={16} aria-hidden="true" focusable="false" />
            삭제
          </button>
          <button
            type="button"
            class={cx("ruricon-icon-action", "ruricon-icon-prioritize-recent")}
            hidden={mode !== "recent"}
            aria-pressed={saved.prioritizeRecent}
            title="전체 탭에서 최근 사용 아이콘 우선 정렬"
            onClick={() =>
              updateSaved((current) => ({
                ...current,
                prioritizeRecent: !current.prioritizeRecent,
              }))
            }
          >
            {saved.prioritizeRecent ? (
              <ArrowUp size={16} aria-hidden="true" focusable="false" />
            ) : (
              <X size={16} aria-hidden="true" focusable="false" />
            )}
            고정
          </button>
        </div>
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
            moveFavoriteToFront={mode === "favorites" && editMode ? moveFavoriteToFront : undefined}
            selectIcon={selectionMode ? selectIcon : undefined}
            selected={selectionMode && selection.has(src)}
          />
        ))}
        {!images.length && !loading.busy && (
          <div class="ruricon-icon-empty" role="img" aria-label="표시할 아이콘이 없습니다.">
            <SquareOff size={32} aria-hidden="true" focusable="false" />
          </div>
        )}
      </div>
      {selectionMode && (
        <div class="ruricon-icon-selection-actions">
          <button
            type="button"
            class={cx("ruricon-icon-action", "ruricon-icon-select-all")}
            disabled={!saved.favorites.length}
            onClick={() => setSelection(new Set(saved.favorites))}
          >
            <SquareDashed size={16} aria-hidden="true" focusable="false" />
            모두 선택
          </button>
          <button
            type="button"
            class={cx("ruricon-icon-action", "ruricon-icon-delete-selected")}
            disabled={!selectedCount}
            onClick={() => {
              if (!window.confirm(`선택한 즐겨찾기 ${selectedCount}개를 삭제하시겠습니까?`)) return
              updateSaved((current) => ({
                ...current,
                favorites: current.favorites.filter((src) => !selection.has(src)),
              }))
              setSelection(new Set<string>())
            }}
          >
            <Trash2 size={16} aria-hidden="true" focusable="false" />
            {selectedCount}개 삭제
          </button>
        </div>
      )}
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
