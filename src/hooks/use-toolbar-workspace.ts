"use client"

/**
 * 表格页工具栏工作区状态：整栏折叠（localStorage 持久化，useSyncExternalStore 订阅）
 * + 应用内全屏（ESC 退出）。供陆运账单、出纳核销两页的工具栏复用。
 */

import React from "react"

/** 同标签页内写入后广播用的事件（storage 事件只在跨标签页写入时触发） */
const COLLAPSED_CHANGE_EVENT = "toolbar-collapsed-change"

/**
 * 折叠态的内存缓存（按 storageKey）：localStorage 读穿的权威副本。
 * 存储被禁用（隐私模式/沙箱）时读写降级为仅本次会话，折叠按钮不会失效。
 */
const collapsedCache = new Map<string, boolean>()

/** 判断是否有 Radix 浮层（弹窗/下拉/Select）打开——ESC 应优先关闭它们而不是退出全屏 */
function hasOpenRadixLayer(): boolean {
  return Boolean(
    document.querySelector(
      '[data-state="open"][role="dialog"], [data-state="open"][role="menu"], [data-state="open"][role="listbox"]'
    )
  )
}

function readCollapsed(storageKey: string): boolean {
  const cached = collapsedCache.get(storageKey)
  if (cached !== undefined) return cached
  let value = false
  try {
    value = window.localStorage.getItem(storageKey) === "1"
  } catch {
    // localStorage 不可用：仅本次会话生效
  }
  collapsedCache.set(storageKey, value)
  return value
}

function writeCollapsed(storageKey: string, value: boolean) {
  collapsedCache.set(storageKey, value)
  try {
    window.localStorage.setItem(storageKey, value ? "1" : "0")
  } catch {
    // 写入失败时仅本次会话生效
  }
  window.dispatchEvent(new Event(COLLAPSED_CHANGE_EVENT))
}

function subscribeCollapsed(onStoreChange: () => void) {
  // 跨标签页写入：失效对应缓存后重读，保持各标签页折叠态同步
  const onStorage = (event: StorageEvent) => {
    if (event.key) collapsedCache.delete(event.key)
    onStoreChange()
  }
  window.addEventListener("storage", onStorage)
  window.addEventListener(COLLAPSED_CHANGE_EVENT, onStoreChange)
  return () => {
    window.removeEventListener("storage", onStorage)
    window.removeEventListener(COLLAPSED_CHANGE_EVENT, onStoreChange)
  }
}

export function useToolbarWorkspace(storageKey: string) {
  // SSR/hydration 首帧一律视为展开，水合后再读取 localStorage，避免不匹配
  const collapsed = React.useSyncExternalStore(
    React.useCallback(
      (onStoreChange: () => void) => subscribeCollapsed(onStoreChange),
      []
    ),
    React.useCallback(() => readCollapsed(storageKey), [storageKey]),
    () => false
  )

  // 全屏不持久化：刷新不应困在全屏
  const [fullscreen, setFullscreen] = React.useState(false)

  const toggleCollapsed = React.useCallback(() => {
    writeCollapsed(storageKey, !readCollapsed(storageKey))
  }, [storageKey])

  const toggleFullscreen = React.useCallback(() => setFullscreen((prev) => !prev), [])

  // 全屏时按 ESC 退出；有 Radix 浮层打开时交给浮层自己处理
  React.useEffect(() => {
    if (!fullscreen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || hasOpenRadixLayer()) return
      setFullscreen(false)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [fullscreen])

  return { collapsed, toggleCollapsed, fullscreen, toggleFullscreen }
}
