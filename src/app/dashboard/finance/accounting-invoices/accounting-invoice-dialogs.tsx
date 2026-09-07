"use client"

/**
 * 陆运账单页弹窗集合（受控哑组件，状态与请求回调由编排器持有）：
 * - InvoiceFormDialog   新建/编辑（复用模版编辑表单 AccountingInvoiceForm）
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
import { Loader2, Send } from "lucide-react"
import { AccountingInvoiceForm } from "@/components/finance/accounting-invoice-form"

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
