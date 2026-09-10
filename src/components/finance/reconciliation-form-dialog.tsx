"use client"

import React from "react"
import { Loader2, ReceiptText } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { fetchJson } from "@/lib/api/client"

export type ReconciliationInvoice = {
  id: string
  master_order_number: string | null
  company: string
  order_number: string | null
  bill_to: string | null
  broker_load_number: string | null
  billing_category: string | null
  invoice_number: string
}

type FormValues = {
  checkDate: string
  checkAmount: string
  checkNumber: string
  notes: string
}

function localToday() {
  const date = new Date()
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function emptyValues(): FormValues {
  return { checkDate: localToday(), checkAmount: "", checkNumber: "", notes: "" }
}

function IdentityField({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="min-w-0 rounded-md border bg-slate-50 px-3 py-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 truncate text-sm font-medium" title={value || ""}>{value || "—"}</dd>
    </div>
  )
}

export function ReconciliationFormDialog({
  invoice,
  invoices,
  open,
  onOpenChange,
  onSuccess,
}: {
  invoice?: ReconciliationInvoice | null
  invoices?: ReconciliationInvoice[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}) {
  const [values, setValues] = React.useState<FormValues>(emptyValues)
  const [requestIds, setRequestIds] = React.useState<string[]>([])
  const [saving, setSaving] = React.useState(false)
  const [errors, setErrors] = React.useState<Partial<Record<keyof FormValues, string>>>({})
  const selectedInvoices = React.useMemo(
    () => invoices ?? (invoice ? [invoice] : []),
    [invoice, invoices],
  )
  const primaryInvoice = selectedInvoices[0] ?? null
  const isBatch = selectedInvoices.length > 1

  React.useEffect(() => {
    if (!open) return
    void Promise.resolve().then(() => {
      setValues(emptyValues())
      setRequestIds(selectedInvoices.map(() => crypto.randomUUID()))
      setErrors({})
    })
  }, [open, selectedInvoices])

  const validate = () => {
    const next: typeof errors = {}
    if (!values.checkDate) next.checkDate = "请选择支票日期"
    const amount = Number(values.checkAmount)
    if (!values.checkAmount || !Number.isFinite(amount) || amount <= 0) next.checkAmount = "收款金额必须大于 0"
    else if (!/^\d+(?:\.\d{1,2})?$/.test(values.checkAmount)) next.checkAmount = "金额最多保留两位小数"
    if (!values.checkNumber.trim()) next.checkNumber = "请输入支票号码"
    else if (!/^[A-Za-z0-9]+$/.test(values.checkNumber.trim())) next.checkNumber = "只能输入英文字母和数字"
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const submit = async () => {
    if (!selectedInvoices.length || requestIds.length !== selectedInvoices.length || !validate()) return
    setSaving(true)
    try {
      await fetchJson("/api/finance/reconciliation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: selectedInvoices.map((selectedInvoice, index) => ({
          invoice_id: selectedInvoice.id,
          request_id: requestIds[index],
          check_date: values.checkDate,
          check_amount: values.checkAmount,
          check_number: values.checkNumber,
          notes: values.notes || null,
        })) }),
      })
      toast.success(isBatch
        ? `已用该支票核销 ${selectedInvoices.length} 张账单`
        : `账单 ${primaryInvoice?.invoice_number} 已新增一条核销记录`)
      onOpenChange(false)
      onSuccess?.()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "核销失败")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!saving) onOpenChange(next) }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>登记收款</DialogTitle>
          <DialogDescription>{isBatch
            ? `为 ${selectedInvoices.length} 张同公司账单登记同一张支票，完整支票金额将分别计入每张账单。`
            : "为当前账单登记一次支票收款，同一账单可多次登记。"}</DialogDescription>
        </DialogHeader>

        {primaryInvoice ? (
          <div className="space-y-5">
            {isBatch ? (
              <div className="space-y-3">
                <dl className="grid gap-2 sm:grid-cols-2">
                  <IdentityField label="账单所属公司" value={primaryInvoice.company} />
                  <IdentityField label="选中账单" value={`${selectedInvoices.length} 张`} />
                </dl>
                <div className="max-h-40 overflow-y-auto rounded-md border bg-slate-50 p-3">
                  <ul className="grid gap-1 text-sm sm:grid-cols-2">
                    {selectedInvoices.map((selectedInvoice) => (
                      <li key={selectedInvoice.id} className="truncate" title={selectedInvoice.invoice_number}>
                        {selectedInvoice.invoice_number}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : (
              <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                <IdentityField label="总货号" value={primaryInvoice.master_order_number} />
                <IdentityField label="公司" value={primaryInvoice.company} />
                <IdentityField label="货号" value={primaryInvoice.order_number} />
                <IdentityField label="Broker 公司" value={primaryInvoice.bill_to} />
                <IdentityField label="Load #" value={primaryInvoice.broker_load_number} />
                <IdentityField label="From-To" value={primaryInvoice.billing_category} />
                <div className="sm:col-span-2 lg:col-span-3"><IdentityField label="Invoice Number" value={primaryInvoice.invoice_number} /></div>
              </dl>
            )}

            <fieldset className="space-y-4">
              <legend className="text-sm font-semibold">本次核销</legend>
              <div className="grid gap-4 sm:grid-cols-3">
                <div><Label htmlFor="new-check-date">支票日期 *</Label><Input id="new-check-date" type="date" value={values.checkDate} onChange={(event) => setValues((current) => ({ ...current, checkDate: event.target.value }))} aria-invalid={Boolean(errors.checkDate)} aria-describedby="new-check-date-error" /><p id="new-check-date-error" className="min-h-5 text-xs text-destructive">{errors.checkDate}</p></div>
                <div><Label htmlFor="new-check-amount">金额 *</Label><Input id="new-check-amount" inputMode="decimal" value={values.checkAmount} onChange={(event) => setValues((current) => ({ ...current, checkAmount: event.target.value }))} aria-invalid={Boolean(errors.checkAmount)} aria-describedby="new-check-amount-error" /><p id="new-check-amount-error" className="min-h-5 text-xs text-destructive">{errors.checkAmount}</p></div>
                <div><Label htmlFor="new-check-number">支票号码 *</Label><Input id="new-check-number" value={values.checkNumber} onChange={(event) => setValues((current) => ({ ...current, checkNumber: event.target.value.toUpperCase() }))} placeholder="ACH090426" aria-invalid={Boolean(errors.checkNumber)} aria-describedby="new-check-number-error" /><p id="new-check-number-error" className="min-h-5 text-xs text-destructive">{errors.checkNumber}</p></div>
              </div>
              <div><Label htmlFor="new-reconciliation-notes">备注</Label><Textarea id="new-reconciliation-notes" value={values.notes} onChange={(event) => setValues((current) => ({ ...current, notes: event.target.value }))} maxLength={500} /></div>
            </fieldset>
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>取消</Button>
          <Button onClick={() => void submit()} disabled={saving || !selectedInvoices.length || requestIds.length !== selectedInvoices.length}>
            {saving ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" /> : <ReceiptText className="mr-2 size-4" aria-hidden="true" />}
            {saving ? "正在保存..." : "确认核销"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
