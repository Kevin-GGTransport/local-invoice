"use client"

/**
 * 列设置下拉：按分组列出叶子列，勾选控制显示/隐藏
 * 显隐状态由调用方持有（受控），本组件仅回调 onToggleColumn
 */

import React from "react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Columns3, RotateCcw } from "lucide-react"
import type { VisibilityState } from "@tanstack/react-table"
import { cn } from "@/lib/utils"

export type ColumnSettingsGroup = {
  id: string
  label: string
  columns: readonly { id: string; label: string; locked?: boolean }[]
}

type ColumnSettingsMenuProps = {
  groups: readonly ColumnSettingsGroup[]
  /** 有效的列可见性（含自动规则与手动覆盖的合成结果） */
  columnVisibility: VisibilityState
  onToggleColumn: (id: string, visible: boolean) => void
  onResetColumns?: () => void
  buttonClassName?: string
}

export function ColumnSettingsMenu({
  groups,
  columnVisibility,
  onToggleColumn,
  onResetColumns,
  buttonClassName,
}: ColumnSettingsMenuProps) {
  const isVisible = (id: string) => columnVisibility[id] !== false

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className={cn("h-8", buttonClassName)}>
          <Columns3 className="mr-2 h-4 w-4" />
          列
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-[70vh] w-52 overflow-y-auto">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          显示的列（拖动表头可调整分组顺序）
        </DropdownMenuLabel>
        {groups.map((group, index) => (
          <React.Fragment key={group.id}>
            {index > 0 && <DropdownMenuSeparator className="my-1" />}
            <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
              {group.label}
            </DropdownMenuLabel>
            {group.columns.map((column) => {
              const visible = isVisible(column.id)
              return (
                <DropdownMenuCheckboxItem
                  key={column.id}
                  checked={visible}
                  disabled={column.locked}
                  onSelect={(event) => event.preventDefault()}
                  onCheckedChange={(checked) => onToggleColumn(column.id, checked === true)}
                  className="text-sm"
                >
                  {column.label}
                </DropdownMenuCheckboxItem>
              )
            })}
          </React.Fragment>
        ))}
        {onResetColumns && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onResetColumns} className="text-xs text-muted-foreground">
              <RotateCcw className="mr-2 h-3.5 w-3.5" />
              恢复默认列显示
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
