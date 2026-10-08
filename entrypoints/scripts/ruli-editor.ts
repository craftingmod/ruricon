import { contentSample } from "../lib/constants.ts"
import { iconBoardId } from "../lib/ruli-constants.ts"
import { createArticle, parseArticleURL, writeArticle } from "../lib/ruli-utils.ts"

export async function main() {
  console.log("Hello content 22.")
  const button = addTestButton()
  button.addEventListener("click", async () => {
    const article = createArticle({
      board_id: iconBoardId,
      category: 8,
      content: contentSample,
      subject: "Test",
    }, false)
    const writeResult= await writeArticle(article)
    if (writeResult.success) {
      console.log(writeResult)
      const articleId = parseArticleURL(writeResult.url)
    }
  })
}

/**
 * Test button to execute command
 */
function addTestButton() {
  const button = document.createElement("button")
  button.type = "button"
  button.textContent = "Rulicon 실행 확인"
  Object.assign(button.style, {
    position: "fixed",
    right: "24px",
    bottom: "24px",
    zIndex: "2147483647",
    padding: "24px 36px",
    border: "0",
    borderRadius: "12px",
    background: "#e53935",
    color: "white",
    fontSize: "24px",
    fontWeight: "700",
    cursor: "pointer",
    boxShadow: "0 4px 16px #0006",
  })
  button.addEventListener("click", () => {
    button.textContent = "클릭 동작 확인됨"
  })
  document.body.append(button)

  return button
}
