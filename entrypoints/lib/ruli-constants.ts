export const rms = "ruliweb.com"
export const pcDomain = `bbs.${rms}`
export const mobileDomain = `m.${rms}`
export const apiDomain = `api.${rms}`

export const iconBoardId = 98

const iconApi = `https://${apiDomain}/comment_icon`
export const iconListUrl = `${iconApi}?&more=0&type=first`

export const iconImagesUrl = `https://${apiDomain}/comment_icon?&more=0&type=first`

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

export function getIconImagesUrl(
  iconId: number,
  offset: number = 0,
  limit: number = 100,
) {
  return `${iconApi}?id=${iconId}&offset=${offset}&limit=${limit}`
}