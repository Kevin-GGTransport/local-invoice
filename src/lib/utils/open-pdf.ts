/** 在用户点击事件内打开 PDF：程序化锚点点击（target=_blank）几乎不会被弹窗拦截。 */
export function openPdf(url: string): void {
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.target = "_blank"
  anchor.rel = "noopener"
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}

/** 预留一个空白窗口，用于稍后展示异步生成的 PDF。
 *  必须在点击事件的同步上下文中调用（调用链上任何 await 之前），否则会被弹窗拦截。 */
export function reservePdfWindow(): Window | null {
  return window.open("", "_blank")
}

/** PDF 生成完成后写入预留窗口；生成失败则关闭窗口并抛出原错误。 */
export async function loadIntoPdfWindow(
  popup: Window | null,
  load: () => Promise<string>
): Promise<void> {
  if (!popup) throw new Error("浏览器拦截了弹窗，请允许本站弹出窗口后重试")
  try {
    popup.location.assign(await load())
  } catch (err) {
    popup.close()
    throw err
  }
}
