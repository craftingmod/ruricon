import { X } from "lucide-preact"
import { useLayoutEffect, useRef, useState } from "preact/hooks"

import type { Preset } from "../entrypoints/lib/icon-view.ts"
import { matchesPreset } from "../entrypoints/lib/preset-search.ts"

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

export function PresetDialog({ request, dismiss }: { request: DialogState; dismiss: () => void }) {
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
          <X size={18} />
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
              text={`${preset.id === request.selected ? "✓ " : ""}${preset.title}${preset.imageCount === undefined ? "" : ` - ${preset.imageCount}개`}`}
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
