import type { GridStateSnapshot } from "react-virtuoso"

export function iconGridPage({ scrollTop, viewport, item, gap }: GridStateSnapshot) {
  if (viewport.width <= 0 || item.width < 1 || item.height <= 0) return 0
  // Match Virtuoso's column rounding; a gap at the top exposes the next row.
  const columns = Math.max(
    1,
    Math.floor((viewport.width + gap.column) / (Math.floor(item.width) + gap.column)),
  )
  const row = Math.floor((Math.max(0, scrollTop) + gap.row) / (item.height + gap.row))
  return Math.floor((row * columns) / 100)
}
