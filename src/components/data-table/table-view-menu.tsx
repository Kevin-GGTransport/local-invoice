"use client"

/**
 * 表格视图预设下拉：一键切换已保存视图 / 保存当前状态为新视图 / 更新、重命名、
 * 设为默认、删除。视图数据与 API 由调用方维护，本组件只负责交互与命名弹窗。
 */

import React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Bookmark,
  Check,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Star,
  Trash2,
} from "lucide-react"
import { cn } from "@/lib/utils"

export type TableViewItem = {
  id: string
  name: string
  isDefault: boolean
}

type TableViewMenuProps = {
  views: TableViewItem[]
  /** 当前已应用的视图 id（用于高亮与「更新当前视图」） */
  activeViewId: string | null
  buttonClassName?: string
  onApply: (view: TableViewItem) => void
  onSaveAs: (name: string, isDefault: boolean) => Promise<void> | void
  onUpdateActive: () => Promise<void> | void
  onRename: (view: TableViewItem, name: string) => Promise<void> | void
  onSetDefault: (view: TableViewItem, isDefault: boolean) => Promise<void> | void
  onDelete: (view: TableViewItem) => void
}

export function TableViewMenu({
  views,
  activeViewId,
  buttonClassName,
  onApply,
  onSaveAs,
  onUpdateActive,
  onRename,
  onSetDefault,
  onDelete,
}: TableViewMenuProps) {
  // 保存新视图弹窗
  const [saveOpen, setSaveOpen] = React.useState(false)
  const [saveName, setSaveName] = React.useState("")
  const [saveDefault, setSaveDefault] = React.useState(false)
  const [saving, setSaving] = React.useState(false)

  // 重命名弹窗
  const [renameTarget, setRenameTarget] = React.useState<TableViewItem | null>(null)
  const [renameName, setRenameName] = React.useState("")
  const [renaming, setRenaming] = React.useState(false)

  const [updating, setUpdating] = React.useState(false)
  const activeView = views.find((v) => v.id === activeViewId) ?? null

  const handleSave = async () => {
    const name = saveName.trim()
    if (!name || saving) return
    setSaving(true)
    try {
      await onSaveAs(name, saveDefault)
      setSaveOpen(false)
      setSaveName("")
      setSaveDefault(false)
    } catch {
      // 失败提示由调用方 toast；弹窗保持打开供修改后重试
    } finally {
      setSaving(false)
    }
  }

  const handleRename = async () => {
    if (!renameTarget) return
    const name = renameName.trim()
    if (!name || renaming) return
    setRenaming(true)
    try {
      await onRename(renameTarget, name)
      setRenameTarget(null)
    } catch {
      // 失败提示由调用方 toast；弹窗保持打开供修改后重试
    } finally {
      setRenaming(false)
    }
  }

  const handleUpdate = async () => {
    if (!activeView || updating) return
    setUpdating(true)
    try {
      await onUpdateActive()
    } finally {
      setUpdating(false)
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className={cn("h-8", buttonClassName)}>
            <Bookmark className="mr-2 h-4 w-4" />
            视图
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          {views.length > 0 ? (
            <>
              <DropdownMenuLabel>已保存视图</DropdownMenuLabel>
              {views.map((view) => (
                <DropdownMenuSub key={view.id}>
                  <DropdownMenuSubTrigger
                    className={cn(
                      "gap-2",
                      view.id === activeViewId && "bg-accent text-accent-foreground"
                    )}
                  >
                    <span className="flex min-w-0 flex-1 items-center gap-1.5">
                      {view.isDefault && (
                        <Star
                          className="size-3.5 shrink-0 fill-amber-400 text-amber-400"
                          aria-label="默认视图"
                        />
                      )}
                      <span className="truncate">{view.name}</span>
                    </span>
                    {view.id === activeViewId && <Check className="size-4 shrink-0" />}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuItem onClick={() => onApply(view)}>应用视图</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => void onSetDefault(view, !view.isDefault)}>
                      <Star
                        className={cn(
                          "mr-2 h-4 w-4",
                          view.isDefault && "fill-amber-400 text-amber-400"
                        )}
                      />
                      {view.isDefault ? "取消默认" : "设为默认"}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        setRenameTarget(view)
                        setRenameName(view.name)
                      }}
                    >
                      <Pencil className="mr-2 h-4 w-4" />
                      重命名
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => onDelete(view)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      删除视图
                    </DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              ))}
            </>
          ) : (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">
              暂无保存的视图，可把当前筛选与列配置保存为视图
            </div>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setSaveOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            保存当前为视图…
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!activeView || updating} onClick={() => void handleUpdate()}>
            {updating ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            更新当前视图{activeView ? `「${activeView.name}」` : ""}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* 保存新视图 */}
      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>保存当前为视图</DialogTitle>
            <DialogDescription>
              将保存当前的筛选条件、排序、列显示与分组顺序，应用视图时一键恢复。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-2">
              <label htmlFor="table-view-name" className="text-sm font-medium">
                视图名称
              </label>
              <Input
                id="table-view-name"
                value={saveName}
                maxLength={50}
                placeholder="如：本月未发账单"
                onChange={(event) => setSaveName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void handleSave()
                }}
                autoFocus
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={saveDefault}
                onCheckedChange={(checked) => setSaveDefault(checked === true)}
              />
              设为默认视图（进入页面自动应用）
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveOpen(false)} disabled={saving}>
              取消
            </Button>
            <Button onClick={() => void handleSave()} disabled={saving || !saveName.trim()}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {saving ? "正在保存..." : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 重命名视图 */}
      <Dialog
        open={renameTarget != null}
        onOpenChange={(open) => {
          if (!open && !renaming) setRenameTarget(null)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>重命名视图</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <label htmlFor="table-view-rename" className="text-sm font-medium">
              视图名称
            </label>
            <Input
              id="table-view-rename"
              value={renameName}
              maxLength={50}
              onChange={(event) => setRenameName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void handleRename()
              }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameTarget(null)} disabled={renaming}>
              取消
            </Button>
            <Button onClick={() => void handleRename()} disabled={renaming || !renameName.trim()}>
              {renaming && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {renaming ? "正在保存..." : "确认"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
