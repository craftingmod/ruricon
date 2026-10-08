export const pcDomain = "bbs.ruliweb.com"
export const mobileDomain = "m.ruliweb.com"

export const iconBoardId = 98

export function getEditUrl(
  isMobile: boolean,
  boardId: number,
  postfix: string,
) {
  return `https://${(isMobile ?? false) ? mobileDomain : pcDomain}/community/board/${boardId}/${postfix}`
}

export function getViewUrl(
  boardId: number,
  articleId: number,
  isMobile = false,
) {
  return `https://${isMobile ? mobileDomain : pcDomain}/community/board/${boardId}/read/${articleId}`
}