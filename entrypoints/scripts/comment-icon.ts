export function openRuriconIconView(container: HTMLElement) {
  // shortcut: 임시 표시만 제공하며, 아이콘 뷰 구현 시 이 본문을 교체한다.
  const mock = document.createElement("div")
  mock.className = "ruricon-icon-view"
  mock.setAttribute("role", "status")
  mock.textContent = "Ruricon 아이콘 뷰 (구현 예정)"
  container.replaceChildren(mock)
  container.hidden = false
  container.style.display = "block"
}

export function mountCommentIconHook() {
  const onClick = (event: MouseEvent) => {
    if (!(event.target instanceof Element)) return
    const button = event.target.closest<HTMLButtonElement>('button[onclick*="app.comment_icon("]')
    const container = button?.parentElement?.querySelector<HTMLElement>(".comment_icon")
    if (!container) return

    event.preventDefault()
    event.stopImmediatePropagation()
    openRuriconIconView(container)
  }

  document.addEventListener("click", onClick, true)
  return () => document.removeEventListener("click", onClick, true)
}
