"use client"

/**
 * 表格工作区外壳（陆运账单 / 出纳核销两页共用，样式唯一定义处）
 *
 * - Workspace：常态 space-y-4 / 应用内全屏（fixed inset-0 盖住侧栏与顶栏）容器
 * - ToolbarShell：吸顶工具栏卡（sticky top-16，全屏时 top-0）；
 *   折叠后收成细横条（标题 + 元信息 + 展开/全屏按钮）；
 *   展开态行1 = headerLeft（标题块）+ tabs + actions（可换行），
 *   折叠/全屏按钮绝对定位固定在卡片右上角，children 为行2及以下（全宽）
 * - ToolbarUtilityButtons：折叠 + 全屏按钮组（展开态行1右侧 / 折叠细条共用）
 * - StickyFooter：吸底分页条（长列表滚动时随时翻页）
 */

import React from "react"
import { cn } from "@/lib/utils"
import {
  ToolbarCollapseButton,
  ToolbarFullscreenButton,
} from "@/components/table-toolbar-buttons"

/** 页面根容器：常态纵向排布 / 应用内全屏 */
export function Workspace({
  fullscreen,
  children,
}: {
  fullscreen: boolean
  children: React.ReactNode
}) {
  return (
    <div
      className={
        fullscreen
          ? // 块布局 + space-y-4：flex-col 下内容超出固定高度时子项会被压缩
            "fixed inset-0 z-50 min-w-0 max-w-full space-y-4 overflow-auto bg-background p-3 sm:p-4"
          : "min-w-0 max-w-full space-y-4"
      }
    >
      {children}
    </div>
  )
}

/** 折叠 + 全屏按钮组 */
export function ToolbarUtilityButtons({
  collapsed,
  fullscreen,
  onToggleCollapsed,
  onToggleFullscreen,
  activeFilterCount = 0,
}: {
  collapsed: boolean
  fullscreen: boolean
  onToggleCollapsed: () => void
  onToggleFullscreen: () => void
  /** 折叠态下生效筛选数量角标 */
  activeFilterCount?: number
}) {
  return (
    <>
      <ToolbarCollapseButton
        collapsed={collapsed}
        activeFilterCount={activeFilterCount}
        onToggle={onToggleCollapsed}
      />
      <ToolbarFullscreenButton fullscreen={fullscreen} onToggle={onToggleFullscreen} />
    </>
  )
}

type ToolbarShellProps = {
  fullscreen: boolean
  collapsed: boolean
  onToggleCollapsed: () => void
  onToggleFullscreen: () => void
  /** 工具栏标题（折叠细条上显示） */
  title: string
  /** 折叠细条上标题旁的元信息（计数/筛选角标等） */
  collapsedMeta?: React.ReactNode
  /** 折叠按钮上生效筛选数量角标 */
  activeFilterCount?: number
  /** 回报工具栏实际高度（供计算表格滚动容器 max-height） */
  onHeightChange?: (height: number) => void
  /** 行1 左侧标题块（页面唯一 h1 所在） */
  headerLeft: React.ReactNode
  /** 行1 中部：状态 Tab 组 */
  tabs?: React.ReactNode
  /** 行1 右侧操作簇（可换行；折叠/全屏按钮固定在卡片右上角，不在此列） */
  actions?: React.ReactNode
  /** 行2 及以下（筛选区等），全宽展示、不受右上角按钮预留影响 */
  children?: React.ReactNode
}

/** 吸顶工具栏卡：折叠后收成细横条；展开态折叠/全屏按钮固定在右上角 */
export function ToolbarShell({
  fullscreen,
  collapsed,
  onToggleCollapsed,
  onToggleFullscreen,
  title,
  collapsedMeta,
  activeFilterCount = 0,
  onHeightChange,
  headerLeft,
  tabs,
  actions,
  children,
}: ToolbarShellProps) {
  const stickyRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const el = stickyRef.current
    if (!el || !onHeightChange) return
    const report = () => onHeightChange(el.offsetHeight)
    report()
    const observer = new ResizeObserver(report)
    observer.observe(el)
    return () => observer.disconnect()
  }, [onHeightChange])

  return (
    <div
      ref={stickyRef}
      className={cn(
        "sticky z-30 overflow-hidden rounded-xl border bg-card shadow-sm",
        fullscreen ? "top-0" : "top-16"
      )}
    >
      {/* 折叠/全屏固定在卡片右上角同一位置（折叠/展开切换不位移，也不随操作按钮换行下沉） */}
      <div className="absolute right-1.5 top-1.5 z-10">
        <ToolbarUtilityButtons
          collapsed={collapsed}
          fullscreen={fullscreen}
          activeFilterCount={activeFilterCount}
          onToggleCollapsed={onToggleCollapsed}
          onToggleFullscreen={onToggleFullscreen}
        />
      </div>
      {collapsed ? (
        /* 折叠细条：标题 + 元信息（右侧预留 80px 给固定按钮） */
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 pl-3 pr-20 sm:pl-4">
          <h1 className="text-sm font-semibold tracking-tight">{title}</h1>
          {collapsedMeta}
        </div>
      ) : (
        <>
          {/* 行1：标题块 + Tab + 操作簇；右侧固定预留 80px 给右上角按钮（pl/pr 分写避免 sm:px 覆盖） */}
          <div className="border-b bg-muted/40 pl-3 pr-20 sm:pl-4">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1">
                {headerLeft}
                {tabs}
              </div>
              {actions ? (
                <div className="flex shrink-0 flex-wrap items-center gap-1.5 py-2">
                  {actions}
                </div>
              ) : null}
            </div>
          </div>
          {children}
        </>
      )}
    </div>
  )
}

/** 吸底浮动条：只负责吸底与阴影（视觉外壳由内容自带），长列表滚动时保持可见 */
export function StickyFooter({ children }: { children: React.ReactNode }) {
  return <div className="sticky bottom-0 z-20 shadow-md">{children}</div>
}
