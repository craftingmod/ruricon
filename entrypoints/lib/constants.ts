import { getEditUrl, iconBoardId } from "./ruli-constants.ts"

// @TODO remove hardcoded path
export const chromeExec = "C:/Program Files/Google/Chrome Beta/Application/chrome.exe"

export const editorPages = [
  getEditUrl(false, iconBoardId, "write"),
  getEditUrl(false, iconBoardId, "modify/*"),
]

export const contentSample = `
<p><br></p><p style="text-align: center;"><img src="https://i2.ruliweb.com/ori/26/09/23/1a0ce8acce92fe565.gif?icon=4048" style="max-width: 100%;"></p><p style="text-align: center;"><br></p><p style="text-align: center;"><br></p><p><br></p>`

export const splitNum = 96