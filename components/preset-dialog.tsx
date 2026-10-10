import { Check, Star, X } from "lucide-preact"
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks"

import { getCachedImageCount, loadCollection, type Preset } from "../entrypoints/lib/icon-view.ts"
import { matchesPreset } from "../entrypoints/lib/preset-search.ts"
import { getViewUrl, iconBoardId, mobileDomain } from "../entrypoints/lib/ruli-constants.ts"

import "./preset-dialog.css"

export type DialogRequest = {
  presets: Preset[]
  selected: number | null
  opener: HTMLElement
  choose: (preset: Preset) => void
}
export type DialogState = DialogRequest & { open: boolean }

export function PresetLabel({ text, preset }: { text: string; preset: Preset | null }) {
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

export function PresetDialog({
  request,
  dismiss,
  presetFavorites,
  toggleFavorite,
  storageError,
  removedPresetIds,
  removePreset,
}: {
  request: DialogState
  dismiss: () => void
  presetFavorites: number[]
  toggleFavorite: (id: number) => void
  storageError: string | null
  removedPresetIds: number[]
  removePreset: (preset: Preset) => Promise<void>
}) {
  const [query, setQuery] = useState("")
  const [previewVisible, setPreviewVisible] = useState(false)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [preview, setPreview] = useState<{
    id: number
    images: string[]
    total: number
    error: string
  } | null>(null)
  const [retry, setRetry] = useState(0)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState("")
  const deletePending = useRef(false)
  const modal = useRef<HTMLDialogElement>(null)
  const search = useRef<HTMLInputElement>(null)
  // Keep the opening order until the next dialog request.
  const presets = request.presets.filter((preset) => !removedPresetIds.includes(preset.id))
  const filtered = presets.filter((preset) => matchesPreset(preset.title, query))
  const selected = presets.find((preset) => preset.id === selectedId)
  const currentPreview = preview?.id === selectedId ? preview : null
  const articleUrl = (preset: Preset) =>
    getViewUrl(iconBoardId, preset.mainId ?? preset.id, location.hostname === mobileDomain)

  useLayoutEffect(() => {
    if (!request.open) return
    const dialog = modal.current!
    setQuery("")
    setDeleteError("")
    setPreviewVisible(false)
    setSelectedId(request.selected ?? presets[0]?.id ?? null)
    request.opener.focus()
    dialog.showModal()
    search.current!.focus()
    return () => {
      dialog.close()
      request.opener.focus()
    }
  }, [request])

  useEffect(() => {
    if (!request.open || !selected) return
    let active = true
    setPreview(null)
    loadCollection(selected).then(
      (collection) => {
        if (!active) return
        const page =
          selected.mainId === null
            ? collection.pages[0]
            : collection.pages.find((page) => page.number === 1)
        setPreview({
          id: selected.id,
          images: page?.images.slice(0, 50) ?? [],
          total: collection.pages[0]?.total ?? 0,
          error: "",
        })
      },
      (error: unknown) => {
        if (active)
          setPreview({
            id: selected.id,
            images: [],
            total: 0,
            error: error instanceof Error ? error.message : "미리보기를 불러오지 못했습니다.",
          })
      },
    )
    return () => {
      active = false
    }
  }, [request.open, selected, retry])

  async function deleteSelected() {
    if (
      !selected ||
      deletePending.current ||
      !window.confirm(`「${selected.title}」를 루리웹 아이콘팩 즐겨찾기에서 삭제하시겠습니까?`)
    )
      return
    deletePending.current = true
    setDeleting(true)
    setDeleteError("")
    try {
      await removePreset(selected)
      setSelectedId(presets.find((preset) => preset.id !== selected.id)?.id ?? null)
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "프리셋을 삭제하지 못했습니다.")
    } finally {
      deletePending.current = false
      setDeleting(false)
    }
  }

  return (
    <dialog
      ref={modal}
      class="ruricon-preset-dialog"
      data-mobile={String(location.hostname === mobileDomain)}
      data-preview-visible={String(previewVisible)}
      aria-labelledby="ruricon-preset-title"
      onClick={(event) => {
        if (event.target !== event.currentTarget || deletePending.current) return
        const bounds = event.currentTarget.getBoundingClientRect()
        if (
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom
        )
          dismiss()
      }}
      onClose={() => {
        if (!modal.current?.open) dismiss()
      }}
      onCancel={(event) => {
        if (deletePending.current) event.preventDefault()
      }}
    >
      <div class="ruricon-preset-heading">
        <strong id="ruricon-preset-title">프리셋 선택</strong>
        <button
          type="button"
          class="ruricon-preset-close"
          aria-label="프리셋 선택 닫기"
          disabled={deleting}
          onClick={dismiss}
        >
          <X size={18} />
        </button>
      </div>
      <div class="ruricon-preset-body">
        <section class="ruricon-preset-sidebar" aria-label="내 프리셋">
          <input
            ref={search}
            type="search"
            placeholder="프리셋 이름 검색…"
            aria-label="프리셋 이름 검색"
            value={query}
            onInput={(event) => setQuery(event.currentTarget.value)}
          />
          <div class="ruricon-preset-list-heading">
            <span>내 프리셋</span>
            <span>즐겨찾기 우선</span>
          </div>
          <div class="ruricon-preset-list">
            {filtered.map((preset) => {
              const imageCount = getCachedImageCount(preset) ?? preset.imageCount
              return (
                <div
                  key={preset.id}
                  class="ruricon-preset-row"
                  data-selected={String(preset.id === selectedId)}
                  data-favorite={String(presetFavorites.includes(preset.id))}
                >
                  <button
                    type="button"
                    class="ruricon-preset-option"
                    aria-label={`${preset.title} 선택`}
                    aria-pressed={preset.id === selectedId}
                    disabled={deleting}
                    onClick={() => setSelectedId(preset.id)}
                  >
                    <PresetLabel preset={preset} text="" />
                    <span class="ruricon-preset-row-label">
                      <span class="ruricon-preset-title">{preset.title}</span>
                      <span class="ruricon-preset-count">
                        {imageCount === undefined ? null : `${imageCount}개`}
                      </span>
                    </span>
                    {preset.id === selectedId && <Check size={18} aria-hidden="true" />}
                  </button>
                  <button
                    type="button"
                    class="ruricon-preset-favorite"
                    aria-label={`${preset.title} 프리셋 즐겨찾기`}
                    title="프리셋 즐겨찾기"
                    aria-pressed={presetFavorites.includes(preset.id)}
                    disabled={deleting}
                    onClick={() => toggleFavorite(preset.id)}
                  >
                    <Star
                      size={18}
                      fill={presetFavorites.includes(preset.id) ? "currentColor" : "none"}
                      aria-hidden="true"
                    />
                  </button>
                </div>
              )
            })}
            {!filtered.length &&
              (request.presets.length
                ? "검색 결과가 없습니다."
                : "등록된 아이콘팩 즐겨찾기가 없습니다.")}
          </div>
        </section>
        <section
          id="ruricon-preset-detail"
          class="ruricon-preset-detail"
          aria-label="프리셋 아이콘 미리보기"
          aria-busy={Boolean(selected && !currentPreview)}
        >
          {selected ? (
            <>
              <h2>
                <a href={articleUrl(selected)} target="_blank" rel="noopener noreferrer">
                  {selected.title}
                </a>
              </h2>
              <p>
                {currentPreview && !currentPreview.error ? `${currentPreview.total}개 아이콘` : ""}
              </p>
              <p class="ruricon-preset-status" role="status">
                {!currentPreview
                  ? "미리보기 불러오는 중…"
                  : currentPreview.error ||
                    (!currentPreview.images.length ? "미리볼 아이콘이 없습니다." : null)}
              </p>
              {currentPreview?.error && (
                <button type="button" onClick={() => setRetry((current) => current + 1)}>
                  다시 시도
                </button>
              )}
              <div class="ruricon-preset-preview-grid">
                {currentPreview?.images.map((src, index) =>
                  src.includes(".mp4") ? (
                    <video
                      key={src}
                      src={src}
                      preload="metadata"
                      muted
                      playsInline
                      aria-label={`아이콘 ${index + 1}`}
                    />
                  ) : (
                    <img key={src} src={src} loading="lazy" alt={`아이콘 ${index + 1}`} />
                  ),
                )}
              </div>
            </>
          ) : (
            <p>미리볼 프리셋을 선택해주세요.</p>
          )}
        </section>
      </div>
      <footer class="ruricon-preset-footer">
        <button
          type="button"
          class="ruricon-preset-delete"
          disabled={!selected || deleting}
          onClick={() => void deleteSelected()}
        >
          삭제
        </button>
        {(deleteError || storageError) && <span role="status">{deleteError || storageError}</span>}
        <button type="button" class="ruricon-preset-cancel" disabled={deleting} onClick={dismiss}>
          취소
        </button>
        <button
          type="button"
          class="ruricon-preset-preview-toggle"
          disabled={!selected || deleting}
          aria-controls="ruricon-preset-detail"
          aria-expanded={previewVisible}
          onClick={() => setPreviewVisible((current) => !current)}
        >
          <span class="ruricon-preset-show-preview">미리보기</span>
          <span class="ruricon-preset-show-list">목록</span>
        </button>
        <button
          type="button"
          class="ruricon-preset-apply"
          disabled={!selected || deleting}
          onClick={() => {
            if (selected) {
              dismiss()
              request.choose(selected)
            }
          }}
        >
          적용
        </button>
      </footer>
    </dialog>
  )
}
