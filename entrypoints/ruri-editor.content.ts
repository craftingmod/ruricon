import { iconBoardId, pcDomain } from "./lib/constants.ts"

export default defineContentScript({
  matches: [
    `https://${pcDomain}/community/board/${iconBoardId}/write`,
    `https://${pcDomain}/community/board/${iconBoardId}/modify/*`,
  ],
  main() {
    console.log("Hello content.")
  },
})
