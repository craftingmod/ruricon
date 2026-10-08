import { splitNum } from "../constants.ts"

function parseIconHtml(html: string) {
  const doc = new DOMParser().parseFromString(html, "text/html")
  for (const video of doc.body.querySelectorAll("video[src]")) {
    const src = video.getAttribute("src")!
    const gifSrc = src.replace(/\.mp4\?gif(?=#|$)/i, ".gif")
    if (gifSrc === src) continue
    const image = doc.createElement("img")
    image.setAttribute("src", gifSrc)
    video.replaceWith(image)
  }
  return doc
}

export function countImages(html: string) {
  return parseIconHtml(html).body.querySelectorAll("img").length
}

export function organizeImages(html: string) {
  const doc = parseIconHtml(html)
  const images = [...doc.body.querySelectorAll("img[src]")]

  const grid = doc.createElement("p")
  grid.setAttribute(
    "style",
    "display: grid; grid-template-columns: repeat(8, 1fr); gap: 2px; border: 2px solid Grey; background-color: White; padding: 2px; box-sizing: border-box;",
  )
  images.forEach((image, index) => {
    const item = doc.createElement("img")
    item.setAttribute("src", image.getAttribute("src")!)
    item.setAttribute("alt", String(index))
    grid.append(item)
    image.remove()
  })
  let trimmed = false
  for (const paragraph of doc.body.querySelectorAll("p")) {
    if (
      !paragraph.textContent?.trim() &&
      [...paragraph.children].every((child) => child.tagName === "BR")
    ) {
      paragraph.remove()
      trimmed = true
    }
  }
  if (images.length) doc.body.append(grid)
  return images.length || trimmed ? doc.body.innerHTML.trim() : html
}

export function splitImages(html: string) {
  const doc = parseIconHtml(html)
  const images = [...doc.body.querySelectorAll("img[src]")]
  if (images.length <= 100) return null
  const pages: string[] = []
  for (let index = 0; index < images.length; index += splitNum) {
    pages.push(
      organizeImages(
        images
          .slice(index, index + 90)
          .map((image) => image.outerHTML)
          .join(""),
      ),
    )
  }
  for (const image of images) image.remove()
  return { mainHtml: organizeImages(doc.body.innerHTML), pages }
}
