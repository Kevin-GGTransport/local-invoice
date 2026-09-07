"use client"

/**
 * 陆运账单页弹窗集合（受控哑组件，状态与请求回调由编排器持有）：
 * - InvoiceFormDialog   新建/编辑（复用模版编辑表单 AccountingInvoiceForm）
 * - ImportInvoicesDialog Excel 批量导入（按账单编号 upsert，错误明细由编排器传入）
 * - SendInvoiceDialog   单条/批量发账单（设置 Invoice 日期并打开 PDF）
 * - NegativeDateDialog  批量修改负数账单 Invoice 日期
 * - DeductionDialog     批量填写/清除扣钱说明
 */

import React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FileSpreadsheet, Loader2, Send } from "lucide-react"
import { AccountingInvoiceForm } from "@/components/finance/accounting-invoice-form"
import type { ImportRowError } from "@/lib/finance/accounting-invoice-import"

export type SendTarget = {
  ids: string[]
  label: string
  isBatch: boolean
}

type InvoiceFormDialogProps = {
  open: boolean
  detailLoading: boolean
  editingRecord: Record<string, unknown> | null
  onClose: () => void
  onSaved: () => void
}

export function InvoiceFormDialog({
  open,
  detailLoading,
  editingRecord,
  onClose,
  onSaved,
}: InvoiceFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent className="max-h-[92vh] w-[min(96vw,80rem)] max-w-7xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingRecord ? "编辑陆运账单" : "新建陆运账单"}</DialogTitle>
        </DialogHeader>
        {detailLoading ? (
          <div className="flex min-h-[200px] items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            正在加载账单...
          </div>
        ) : (
          <AccountingInvoiceForm
            key={String(editingRecord?.id ?? "new")}
            data={editingRecord}
            inDialog
            onSuccess={() => {
              onClose()
              onSaved()
            }}
            onCancel={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

type ImportInvoicesDialogProps = {
  open: boolean
  importing: boolean
  file: File | null
  rowErrors: ImportRowError[] | null
  ignoredColumns: string[] | null
  onFileChange: (file: File | null) => void
  onDownloadTemplate: () => void
  onConfirm: () => void
  onClose: () => void
}

export function ImportInvoicesDialog({
  open,
  importing,
  file,
  rowErrors,
  ignoredColumns,
  onFileChange,
  onDownloadTemplate,
  onConfirm,
  onClose,
}: ImportInvoicesDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !importing) onClose()
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>导入账单（Excel）</DialogTitle>
          <DialogDescription>
            按账单编号导入：已存在则覆盖文件中出现的列（留空即清空该字段），不存在则新增。
            明细行、货号、合同金额（已有账单）等系统维护字段不受影响。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <Button type="button" variant="outline" size="sm" onClick={onDownloadTemplate}>
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            下载导入模板
          </Button>
          <Input
            type="file"
            accept=".xlsx"
            disabled={importing}
            onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
          />
          {file && (
            <p className="text-xs text-muted-foreground">已选择：{file.name}</p>
          )}
          <p className="text-xs text-muted-foreground">
            仅支持 .xlsx 文件（.xls 请先另存为 .xlsx），单次最多 2000 行；多余的列会被忽略。
          </p>
          {ignoredColumns && ignoredColumns.length > 0 && (
            <p className="text-xs text-muted-foreground">
              以下列不是导入字段，已被忽略：{ignoredColumns.join("、")}
            </p>
          )}
          {rowErrors && rowErrors.length > 0 && (
            <div className="rounded-md border border-rose-200 bg-rose-50 p-2 dark:border-rose-900 dark:bg-rose-950">
              <p className="text-xs font-medium text-rose-700 dark:text-rose-300">
                以下行未通过校验，本次未写入任何数据，请修正后重新上传：
              </p>
              <ul className="mt-1 max-h-56 list-disc space-y-1 overflow-y-auto pl-4">
                {rowErrors.map((item, index) => (
                  <li
                    key={`${item.row}-${index}`}
                    className="text-xs text-rose-700 dark:text-rose-300"
                  >
                    {item.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={importing}>
            取消
          </Button>
          <Button onClick={onConfirm} disabled={importing || !file}>
            {importing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {importing ? "正在导入..." : "开始导入"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

type SendInvoiceDialogProps = {
  target: SendTarget | null
  sending: boolean
  sendDate: string
  onSendDateChange: (value: string) => void
  onConfirm: () => void
  onClose: () => void
}

export function SendInvoiceDialog({
  target,
  sending,
  sendDate,
  onSendDateChange,
  onConfirm,
  onClose,
}: SendInvoiceDialogProps) {
  return (
    <Dialog
      open={target != null}
      onOpenChange={(open) => {
        if (!open && !sending) onClose()
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{target?.isBatch ? "批量发账单" : "发账单"}</DialogTitle>
          <DialogDescription>
            确认后将为 {target?.label ?? "选中账单"} 设置 Invoice 日期并打开 PDF。
            普通账单日期设置后不可修改；负数账单可在“负数账单”中批量修改日期。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <label htmlFor="send-invoice-date" className="text-sm font-medium">
            Invoice 日期
          </label>
          <Input
            id="send-invoice-date"
            type="date"
            value={sendDate}
            onChange={(event) => onSendDateChange(event.target.value)}
            disabled={sending}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={sending}>
            取消
          </Button>
          <Button onClick={onConfirm} disabled={sending || !sendDate}>
            {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            {sending ? "正在发送..." : "确认发送"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

type NegativeDateDialogProps = {
  ids: string[] | null
  saving: boolean
  date: string
  onDateChange: (value: string) => void
  onConfirm: () => void
  onClose: () => void
}

export function NegativeDateDialog({
  ids,
  saving,
  date,
  onDateChange,
  onConfirm,
  onClose,
}: NegativeDateDialogProps) {
  return (
    <Dialog
      open={ids != null}
      onOpenChange={(open) => {
        if (!open && !saving) onClose()
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>批量修改 Invoice 日期</DialogTitle>
          <DialogDescription>
            将为选中的 {ids?.length ?? 0} 条负数账单统一设置 Invoice 日期，覆盖已有日期。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <label htmlFor="negative-invoice-date" className="text-sm font-medium">Invoice 日期</label>
          <Input id="negative-invoice-date" type="date" value={date}
            onChange={(event) => onDateChange(event.target.value)} disabled={saving} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>取消</Button>
          <Button onClick={onConfirm} disabled={saving || !date}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {saving ? "正在保存..." : "确认修改"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

type DeductionDialogProps = {
  ids: string[] | null
  saving: boolean
  text: string
  initText: string
  onTextChange: (value: string) => void
  onConfirm: () => void
  onClose: () => void
}

export function DeductionDialog({
  ids,
  saving,
  text,
  initText,
  onTextChange,
  onConfirm,
  onClose,
}: DeductionDialogProps) {
  return (
    <Dialog
      open={ids != null}
      onOpenChange={(open) => {
        if (!open && !saving) onClose()
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>修改扣钱</DialogTitle>
          <DialogDescription>
            为选中的 {ids?.length ?? 0} 条账单填写统一的扣钱说明，留空并保存即清除扣钱；扣钱不参与差额计算。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <label htmlFor="invoice-deduction-input" className="text-sm font-medium">扣钱说明</label>
          <Input id="invoice-deduction-input" value={text} maxLength={200}
            placeholder="如 RTS、扣款原因（最长 200 字）"
            onChange={(event) => onTextChange(event.target.value)} disabled={saving}
            onKeyDown={(event) => { if (event.key === "Enter") onConfirm() }} />
          {initText && text === initText && (
            <p className="text-xs text-muted-foreground">已带入选中账单中首个非空扣钱说明，可直接修改或清空。</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>取消</Button>
          <Button onClick={onConfirm} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {saving ? "正在保存..." : "确认修改"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
