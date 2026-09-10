"use client"

/**
 * 覆盖式滚动容器（表格滚动区统一使用）
 *
 * 原生滚动条会占据布局空间：不透明方角轨道盖住圆角容器的角落，竖向槽位
 * 还会在表头背景右侧留出缺口。本组件隐藏原生滚动条，改用浮在内容上的
 * 细圆角滑块（可按住拖拽），使内容（表头背景/圆角）延伸到容器边缘。
 *
 * - className/maxHeight 挂在外层可视包裹层；内部滚动层负责滚动
 * - refreshKey：内容数据变化（加载完成/行数变化）时触发一次重算
 */

import React from "react"
import { cn } from "@/lib/utils"

type OverlayScrollProps = {
  /** 挂到可视包裹层的类名（圆角/边框/背景/显隐控制等） */
  className?: string
  /** 滚动层 max-height（CSS 值） */
  maxHeight?: string
  /** 内容变化时递增/变化的值（如 `${loading}-${rows.length}`），用于触发滑块重算 */
  refreshKey?: string | number
  children: React.ReactNode
}

type ThumbState = {
  showV: boolean
  showH: boolean
  /** 竖向滑块：距顶比例（0-1）与高度占比（0-100%） */
  vTop: number
  vHtPct: number
  /** 横向滑块：距左比例（0-1）与宽度占比（0-100%） */
  hLeft: number
  hWPct: number
}

const INITIAL_THUMB: ThumbState = {
  showV: false,
  showH: false,
  vTop: 0,
  vHtPct: 0,
  hLeft: 0,
  hWPct: 0,
}

export function OverlayScroll({ className, maxHeight, refreshKey, children }: OverlayScrollProps) {
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const [thumb, setThumb] = React.useState<ThumbState>(INITIAL_THUMB)

  React.useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const report = () => {
      const showV = el.scrollHeight > el.clientHeight
      const showH = el.scrollWidth > el.clientWidth
      setThumb({
        showV,
        showH,
        vTop: showV ? el.scrollTop / (el.scrollHeight - el.clientHeight) : 0,
        vHtPct: showV ? (el.clientHeight / el.scrollHeight) * 100 : 0,
        hLeft: showH ? el.scrollLeft / (el.scrollWidth - el.clientWidth) : 0,
        hWPct: showH ? (el.clientWidth / el.scrollWidth) * 100 : 0,
      })
    }
    el.addEventListener("scroll", report, { passive: true })
    const observer = new ResizeObserver(report)
    observer.observe(el)
    if (el.firstElementChild instanceof HTMLElement) observer.observe(el.firstElementChild)
    return () => {
      el.removeEventListener("scroll", report)
      observer.disconnect()
    }
    // maxHeight（容器高度变化）与 refreshKey（内容到达）变化时重新观察，
    // 重新 observe 会异步触发一次回报
  }, [maxHeight, refreshKey])

  const startVDrag = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const el = scrollRef.current
    if (!el) return
    event.preventDefault()
    const startY = event.clientY
    const startScrollTop = el.scrollTop
    const onMove = (ev: PointerEvent) => {
      const ratio = el.clientHeight / el.scrollHeight
      el.scrollTop = startScrollTop + (ev.clientY - startY) / Math.max(ratio, 0.01)
    }
    const onUp = () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
    }
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
  }, [])

  const startHDrag = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const el = scrollRef.current
    if (!el) return
    event.preventDefault()
    const startX = event.clientX
    const startScrollLeft = el.scrollLeft
    const onMove = (ev: PointerEvent) => {
      const ratio = el.clientWidth / el.scrollWidth
      el.scrollLeft = startScrollLeft + (ev.clientX - startX) / Math.max(ratio, 0.01)
    }
    const onUp = () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
    }
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
  }, [])

  const { showV, showH, vTop, vHtPct, hLeft, hWPct } = thumb

  return (
    <div className={cn("relative min-w-0 max-w-full overflow-hidden", className)}>
      <div
        ref={scrollRef}
        className="w-full min-w-0 max-w-full overflow-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ maxHeight }}
      >
        {children}
      </div>
      {showV && (
        <div
          aria-hidden="true"
          onPointerDown={startVDrag}
          className="absolute right-1 top-1 z-30 w-1.5 cursor-grab rounded-full bg-foreground/25 transition-colors hover:bg-foreground/40 active:cursor-grabbing"
          style={{ top: `calc(0.25rem + ${vTop} * (100% - 0.5rem))`, height: `${vHtPct}%` }}
        />
      )}
      {showH && (
        <div
          aria-hidden="true"
          onPointerDown={startHDrag}
          className="absolute bottom-1 left-1 z-30 h-1.5 cursor-grab rounded-full bg-foreground/25 transition-colors hover:bg-foreground/40 active:cursor-grabbing"
          style={{ left: `calc(0.25rem + ${hLeft} * (100% - 0.5rem))`, width: `${hWPct}%` }}
        />
      )}
    </div>
  )
}
