"use client"

/**
 * 覆盖式滚动容器（表格与大宽度清单统一使用）
 *
 * 原生滚动条会占用布局空间，也容易在圆角容器右侧/底部形成缺口。这里保留
 * 原生滚动、键盘和触控板能力，但把可见滚动条替换为浮层轨道和滑块：
 * - 鼠标悬停、键盘聚焦或正在滚动时显示，空闲后淡出
 * - 滑块有更大的 12px 命中范围，视觉保持 6px 圆角细条
 * - 可拖拽，同时支持滚轮、触控板、键盘和系统平滑滚动
 * - 双向滚动时预留交叉角，避免横竖滑块重叠
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

type ScrollAxis = "horizontal" | "vertical"

type ThumbState = {
  showV: boolean
  showH: boolean
  vTop: number
  vSize: number
  hLeft: number
  hSize: number
}

const TRACK_GAP = 8
const CROSS_GAP = 16
const MIN_THUMB_SIZE = 36
const INITIAL_THUMB: ThumbState = {
  showV: false,
  showH: false,
  vTop: TRACK_GAP,
  vSize: MIN_THUMB_SIZE,
  hLeft: TRACK_GAP,
  hSize: MIN_THUMB_SIZE,
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}

export function OverlayScroll({ className, maxHeight, refreshKey, children }: OverlayScrollProps) {
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const hideTimerRef = React.useRef<number | null>(null)
  const [thumb, setThumb] = React.useState<ThumbState>(INITIAL_THUMB)
  const [hovering, setHovering] = React.useState(false)
  const [focused, setFocused] = React.useState(false)
  const [recentScroll, setRecentScroll] = React.useState(false)
  const [draggingAxis, setDraggingAxis] = React.useState<ScrollAxis | null>(null)

  const report = React.useCallback(() => {
    const el = scrollRef.current
    if (!el) return

    const showV = el.scrollHeight > el.clientHeight
    const showH = el.scrollWidth > el.clientWidth
    const verticalTrack = el.clientHeight - TRACK_GAP * 2 - (showH ? CROSS_GAP : 0)
    const horizontalTrack = el.clientWidth - TRACK_GAP * 2 - (showV ? CROSS_GAP : 0)
    const verticalThumb = clamp(
      (el.clientHeight / el.scrollHeight) * verticalTrack,
      MIN_THUMB_SIZE,
      Math.max(MIN_THUMB_SIZE, verticalTrack)
    )
    const horizontalThumb = clamp(
      (el.clientWidth / el.scrollWidth) * horizontalTrack,
      MIN_THUMB_SIZE,
      Math.max(MIN_THUMB_SIZE, horizontalTrack)
    )
    const maxTop = Math.max(0, verticalTrack - verticalThumb)
    const maxLeft = Math.max(0, horizontalTrack - horizontalThumb)

    setThumb({
      showV,
      showH,
      vTop: showV
        ? TRACK_GAP + (el.scrollTop / Math.max(1, el.scrollHeight - el.clientHeight)) * maxTop
        : TRACK_GAP,
      vSize: showV ? verticalThumb : MIN_THUMB_SIZE,
      hLeft: showH
        ? TRACK_GAP + (el.scrollLeft / Math.max(1, el.scrollWidth - el.clientWidth)) * maxLeft
        : TRACK_GAP,
      hSize: showH ? horizontalThumb : MIN_THUMB_SIZE,
    })
  }, [])

  React.useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    let frame = 0
    const scheduleReport = () => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        report()
      })
    }

    el.addEventListener("scroll", scheduleReport, { passive: true })
    const observer = new ResizeObserver(scheduleReport)
    observer.observe(el)
    if (el.firstElementChild instanceof HTMLElement) observer.observe(el.firstElementChild)
    scheduleReport()

    return () => {
      el.removeEventListener("scroll", scheduleReport)
      observer.disconnect()
      if (frame) cancelAnimationFrame(frame)
    }
  }, [maxHeight, refreshKey, report])

  const markRecentScroll = React.useCallback(() => {
    setRecentScroll(true)
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current)
    hideTimerRef.current = window.setTimeout(() => setRecentScroll(false), 900)
  }, [])

  React.useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onScroll = () => markRecentScroll()
    el.addEventListener("scroll", onScroll, { passive: true })
    return () => el.removeEventListener("scroll", onScroll)
  }, [markRecentScroll])

  React.useEffect(() => {
    return () => {
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current)
    }
  }, [])

  const startDrag = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>, axis: ScrollAxis) => {
      const el = scrollRef.current
      if (!el) return
      event.preventDefault()
      setDraggingAxis(axis)

      const startClient = axis === "vertical" ? event.clientY : event.clientX
      const startScroll = axis === "vertical" ? el.scrollTop : el.scrollLeft
      const contentSize = axis === "vertical" ? el.scrollHeight : el.scrollWidth
      const viewportSize = axis === "vertical" ? el.clientHeight : el.clientWidth
      const crossAxis = axis === "vertical" ? thumb.showH : thumb.showV
      const trackSize =
        viewportSize -
        TRACK_GAP * 2 -
        (crossAxis ? CROSS_GAP : 0) -
        (axis === "vertical" ? thumb.vSize : thumb.hSize)
      const maxScroll = Math.max(1, contentSize - viewportSize)

      const onMove = (moveEvent: PointerEvent) => {
        const currentClient = axis === "vertical" ? moveEvent.clientY : moveEvent.clientX
        const delta = currentClient - startClient
        const next = startScroll + (delta / Math.max(1, trackSize)) * maxScroll
        if (axis === "vertical") el.scrollTop = next
        else el.scrollLeft = next
      }
      const onUp = () => {
        setDraggingAxis(null)
        window.removeEventListener("pointermove", onMove)
        window.removeEventListener("pointerup", onUp)
        window.removeEventListener("pointercancel", onUp)
      }
      window.addEventListener("pointermove", onMove)
      window.addEventListener("pointerup", onUp)
      window.addEventListener("pointercancel", onUp)
    },
    [thumb.hSize, thumb.showH, thumb.showV, thumb.vSize]
  )

  const barsVisible = hovering || focused || recentScroll || draggingAxis != null
  const { showV, showH, vTop, vSize, hLeft, hSize } = thumb

  return (
    <div
      className={cn("group/overlay-scroll relative min-w-0 max-w-full overflow-hidden", className)}
      data-hovering={hovering}
      data-scroll-active={barsVisible}
      onPointerEnter={() => setHovering(true)}
      onPointerLeave={() => setHovering(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={() => setFocused(false)}
    >
      <div
        ref={scrollRef}
        tabIndex={0}
        aria-label="可滚动内容"
        className="w-full min-w-0 max-w-full overflow-auto overscroll-contain outline-none focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring/40 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ maxHeight }}
      >
        {children}
      </div>

      {showV && (
        <div
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute right-2 top-2 w-2 rounded-full bg-foreground/5 transition-opacity duration-200 motion-reduce:transition-none",
            showH ? "bottom-5" : "bottom-2",
            barsVisible ? "opacity-100" : "opacity-0"
          )}
        />
      )}
      {showH && (
        <div
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute bottom-2 left-2 h-2 rounded-full bg-foreground/5 transition-opacity duration-200 motion-reduce:transition-none",
            showV ? "right-5" : "right-2",
            barsVisible ? "opacity-100" : "opacity-0"
          )}
        />
      )}

      {showV && (
        <div
          aria-hidden="true"
          onPointerDown={(event) => startDrag(event, "vertical")}
          className={cn(
            "absolute right-1 z-30 flex w-3 cursor-grab items-center justify-center rounded-full opacity-0 transition-[opacity,transform] duration-200 motion-reduce:transition-none",
            barsVisible ? "pointer-events-auto translate-x-0 opacity-100" : "pointer-events-none translate-x-1",
            draggingAxis === "vertical" ? "cursor-grabbing" : ""
          )}
          style={{ top: `${vTop}px`, height: `${vSize}px` }}
        >
          <span
            className={cn(
              "h-full w-1.5 rounded-full transition-colors",
              draggingAxis === "vertical"
                ? "bg-primary/75"
                : "bg-foreground/30 group-hover/overlay-scroll:bg-foreground/50"
            )}
          />
        </div>
      )}

      {showH && (
        <div
          aria-hidden="true"
          onPointerDown={(event) => startDrag(event, "horizontal")}
          className={cn(
            "absolute bottom-1 z-30 flex h-3 cursor-grab items-center justify-center rounded-full opacity-0 transition-[opacity,transform] duration-200 motion-reduce:transition-none",
            barsVisible ? "pointer-events-auto translate-y-0 opacity-100" : "pointer-events-none translate-y-1",
            draggingAxis === "horizontal" ? "cursor-grabbing" : ""
          )}
          style={{ left: `${hLeft}px`, width: `${hSize}px` }}
        >
          <span
            className={cn(
              "h-1.5 w-full rounded-full transition-colors",
              draggingAxis === "horizontal"
                ? "bg-primary/75"
                : "bg-foreground/30 group-hover/overlay-scroll:bg-foreground/50"
            )}
          />
        </div>
      )}
    </div>
  )
}
