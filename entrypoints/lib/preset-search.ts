export function matchesPreset(title: string, query: string) {
  const text = title.toLocaleLowerCase().normalize("NFKD")
  const search = query.trim().toLocaleLowerCase().normalize("NFKD")
  if (text.includes(search)) return true
  return (
    /^[\u1100-\u1112\s]+$/u.test(search) &&
    text.replace(/[\u1161-\u1175\u11a8-\u11c2]/gu, "").includes(search)
  )
}
