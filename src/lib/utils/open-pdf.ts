/** 在用户点击事件内打开 PDF：优先新标签页，被浏览器拦截时回退当前页，避免按钮“无响应”。 */
export function openPdf(url: string): void {
  const popup = window.open(url, "_blank")
  if (!popup) window.location.assign(url)
}
