"use client"

/**
 * 表格工具栏右上角的功能按钮：整栏折叠切换 + 应用内全屏切换。
 * 展开态与折叠细条共用（细条上传入 collapsed=true 渲染展开方向图标）。
 */

import React from "react"
import { Button } from "@/components/ui/button"
import { ChevronsDown, ChevronsUp, Maximize2, Minimize2 } from "lucide-react"

export function ToolbarCollapseButton({
  collapsed,
  activeFilterCount = 0,
  onToggle,
}: {
  collapsed: boolean
  /** 折叠时生效中的筛选数量，>0 时在图标上显示角标 */
  activeFilterCount?: number
  onToggle: () => void
}) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className="relative text-muted-foreground"
      aria-label={
        collapsed
          ? activeFilterCount > 0
            ? `展开工具栏（${activeFilterCount} 项筛选生效中）`
            : "展开工具栏"
          : "收起工具栏"
      }
      aria-expanded={!collapsed}
      onClick={onToggle}
    >
      {collapsed ? (
        <ChevronsDown className="size-4" aria-hidden="true" />
      ) : (
        <ChevronsUp className="size-4" aria-hidden="true" />
      )}
      {collapsed && activeFilterCount > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground">
          {activeFilterCount}
        </span>
      )}
    </Button>
  )
}

export function ToolbarFullscreenButton({
  fullscreen,
  onToggle,
}: {
  fullscreen: boolean
  onToggle: () => void
}) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className="text-muted-foreground"
      aria-label={fullscreen ? "退出全屏" : "全屏显示"}
      aria-pressed={fullscreen}
      onClick={onToggle}
    >
      {fullscreen ? (
        <Minimize2 className="size-4" aria-hidden="true" />
      ) : (
        <Maximize2 className="size-4" aria-hidden="true" />
      )}
    </Button>
  )
}
