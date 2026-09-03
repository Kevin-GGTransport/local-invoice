"use client"

/**
 * 陆运账单 模版编辑表单（所见即所得）
 * 选公司 → 呈现该公司的 PDF 模版复刻版式，在版式上直接填写数据；
 * 本功能只管理 PDF 上打印的字段；其余对账字段（同一张表的
 * master_order_number/contract_price/check_* 等）由其他功能维护，不在此编辑。
 */

import React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"
import { Loader2, Printer, CheckCircle2 } from "lucide-react"
import {
  ACCOUNTING_COMPANY_OPTIONS,
  ACCOUNTING_PDF_TEMPLATE_COMPANIES,
} from "@/lib/finance/accounting-invoice-companies"
import { fetchJson } from "@/lib/api/client"
import { openPdf } from "@/lib/utils/open-pdf"

type RowData = Record<string, unknown> | null | undefined

interface AccountingInvoiceFormProps {
  /** EntityTable 传入：编辑时有值，新建为 null */
  data?: RowData
  onSuccess?: () => void
  onCancel?: () => void
  /** 取消按钮文案（详情页复用本表单时传"返回列表"） */
  cancelLabel?: string
}

interface FormLine {
  description: string
  quantity: string
  unitPrice: string
  amount: string
}

interface FormValues {
  company: string
  invoice_number: string
  invoice_date: string
  broker_load_number: string
  bill_to: string
  lines: FormLine[]
  pickup_date: string
  pickup_company: string
  pickup_address: string
  drop_date: string
  drop_company: string
  drop_address: string
}

function str(value: unknown): string {
  if (value == null) return ""
  return String(value)
}

function dateStr(value: unknown): string {
  const s = str(value)
  return s ? s.slice(0, 10) : ""
}

function toNumber(value: string): number | null {
  const t = value.trim()
  if (!t) return null
  const n = Number(t)
  return Number.isNaN(n) ? null : n
}

function fmtMoney(value: string): string {
  const n = toNumber(value)
  if (n == null) return ""
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function emptyLine(): FormLine {
  return { description: "", quantity: "", unitPrice: "", amount: "" }
}

/** 行有效金额：Qty × Rate 齐全时自动算，否则取手填金额（YG 的 Amount 列为只读自动计算） */
function lineAmountValue(line: FormLine): number | null {
  const qty = toNumber(line.quantity)
  const rate = toNumber(line.unitPrice)
  if (qty != null && rate != null) return Math.round(qty * rate * 100) / 100
  return toNumber(line.amount)
}

/** 明细合计（空行忽略） */
function sumLines(lines: FormLine[]): number | null {
  let total = 0
  let has = false
  for (const line of lines) {
    const n = lineAmountValue(line)
    if (n == null) continue
    total += n
    has = true
  }
  return has ? Math.round(total * 100) / 100 : null
}

/** 模版上的小号输入框样式 */
const tplInputCls = "h-7 border-slate-300 bg-white px-1.5 text-[13px] shadow-none"
const tplDateCls = "h-7 border-slate-300 bg-white px-1.5 text-[12px] shadow-none"

interface EditorProps {
  values: FormValues
  setField: (key: keyof Omit<FormValues, "lines">, value: string) => void
  setLines: React.Dispatch<React.SetStateAction<FormLine[]>>
  /** 新建时 Invoice 日期留空且不可编辑；保存后（编辑态）可填写 */
  invoiceDateDisabled: boolean
}

/** 明细行增删按钮条（模版编辑器共用） */
function LineActions({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="mt-2 flex justify-end">
      <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={onAdd}>
        + 添加明细行
      </Button>
    </div>
  )
}

function RemoveLineButton({ onRemove }: { onRemove: () => void }) {
  return (
    <button
      type="button"
      onClick={onRemove}
      title="删除此行"
      className="ml-1 flex h-7 w-7 shrink-0 items-center justify-center rounded border border-slate-300 text-slate-500 hover:border-destructive hover:text-destructive"
    >
      ×
    </button>
  )
}

/** AA 模版（ALREADY ARRIVED LOGISTICS INC，橙色） */
function AaEditor({ values, setField, setLines, invoiceDateDisabled }: EditorProps) {
  return (
    <div>
      {/* 页眉橙色横条 */}
      <div className="flex items-center justify-between bg-[#F6921E] px-4 py-2">
        <span className="text-sm font-bold">ALREADY ARRIVED LOGISTICS INC</span>
        <span className="text-3xl font-bold italic text-[#1C4587]">INVOICE</span>
      </div>

      {/* 公司信息（左） + INVOICE NO./DATE/Load no.（右） */}
      <div className="mt-3 flex items-start justify-between">
        <div className="text-xs leading-5">
          <p>ALREADY ARRIVED LOGISTICS INC</p>
          <p>4011 Berdina Rd</p>
          <p>Castro Valley CA 94546</p>
        </div>
        <div className="flex flex-col gap-1.5">
          {(
            [
              ["INVOICE NO.", "invoice_number", "留空自动生成", "text"],
              ["DATE", "invoice_date", "", "date"],
              ["Load no.", "broker_load_number", "", "text"],
            ] as const
          ).map(([label, key, placeholder, type]) => (
            <div key={key} className="flex w-64 items-center">
              <span className="w-24 shrink-0 text-right text-xs font-bold">{label}</span>
              <Input
                type={type}
                value={values[key]}
                onChange={(e) => setField(key, e.target.value)}
                placeholder={placeholder}
                disabled={invoiceDateDisabled && key === "invoice_date"}
                title={
                  invoiceDateDisabled && key === "invoice_date"
                    ? "新建时留空，保存后可编辑"
                    : undefined
                }
                className={`${type === "date" ? tplDateCls : tplInputCls} ml-2 flex-1`}
              />
            </div>
          ))}
        </div>
      </div>

      {/* TO */}
      <div className="mt-3 flex items-center gap-2">
        <span className="text-sm font-bold">TO</span>
        <Input
          value={values.bill_to}
          onChange={(e) => setField("bill_to", e.target.value)}
          placeholder="客户名"
          className={`${tplInputCls} w-64`}
        />
      </div>

      {/* PICKUPS | DROPS 黑框 */}
      <div className="mt-3 grid grid-cols-2 border-2 border-black">
        <div className="space-y-1.5 border-r-2 border-black p-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold">PICKUPS</span>
            <Input
              type="date"
              value={values.pickup_date}
              onChange={(e) => setField("pickup_date", e.target.value)}
              className={`${tplDateCls} w-32`}
            />
          </div>
          <Input
            value={values.pickup_company}
            onChange={(e) => setField("pickup_company", e.target.value)}
            placeholder="取货公司"
            className={tplInputCls}
          />
          <Textarea
            value={values.pickup_address}
            onChange={(e) => setField("pickup_address", e.target.value)}
            placeholder="取货地址（可多行）"
            className="min-h-[42px] border-slate-300 bg-white px-1.5 text-[12px] shadow-none"
          />
        </div>
        <div className="space-y-1.5 p-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold">DROPS</span>
            <Input
              type="date"
              value={values.drop_date}
              onChange={(e) => setField("drop_date", e.target.value)}
              className={`${tplDateCls} w-32`}
            />
          </div>
          <Input
            value={values.drop_company}
            onChange={(e) => setField("drop_company", e.target.value)}
            placeholder="交货公司"
            className={tplInputCls}
          />
          <Textarea
            value={values.drop_address}
            onChange={(e) => setField("drop_address", e.target.value)}
            placeholder="交货地址（可多行）"
            className="min-h-[42px] border-slate-300 bg-white px-1.5 text-[12px] shadow-none"
          />
        </div>
      </div>

      {/* 明细表（可增删多行） */}
      <div className="mt-3 border border-[#F0B27A]">
        <div className="grid grid-cols-[1fr_170px_28px] bg-[#FDE5CD] text-xs font-bold">
          <div className="border-r border-[#F0B27A] px-2 py-1.5">DESCRIPTION</div>
          <div className="border-r border-[#F0B27A] px-2 py-1.5 text-right">TOTAL</div>
          <div />
        </div>
        {values.lines.map((line, index) => (
          <div
            key={index}
            className="grid grid-cols-[1fr_170px_28px] border-t border-[#F0B27A]"
          >
            <Input
              value={line.description}
              onChange={(e) =>
                setLines((prev) => prev.map((l, i) => (i === index ? { ...l, description: e.target.value } : l)))
              }
              placeholder="如 Carrier Charge"
              className={`${tplInputCls} rounded-none border-0 focus-visible:ring-0`}
            />
            <Input
              value={line.amount}
              onChange={(e) =>
                setLines((prev) => prev.map((l, i) => (i === index ? { ...l, amount: e.target.value } : l)))
              }
              placeholder="0.00"
              className={`${tplInputCls} rounded-none border-0 border-l border-[#F0B27A] text-right focus-visible:ring-0`}
            />
            <div className="flex items-center justify-center border-l border-[#F0B27A]">
              <RemoveLineButton onRemove={() => setLines((prev) => prev.filter((_, i) => i !== index))} />
            </div>
          </div>
        ))}
        <div className="h-8 border-t border-[#F0B27A]" />
      </div>
      <LineActions onAdd={() => setLines((prev) => [...prev, emptyLine()])} />

      {/* TOTAL DUE */}
      <div className="mt-4 flex items-center justify-end gap-3">
        <span className="text-base font-bold">TOTAL DUE</span>
        <span className="min-w-[110px] bg-[#F6921E] px-4 py-1.5 text-right text-base font-bold text-white">
          {sumLines(values.lines) == null ? "$0.00" : fmtMoney(String(sumLines(values.lines)))}
        </span>
      </div>

      {/* 页脚 */}
      <div className="mt-6 flex items-end justify-between text-[10px] leading-4 text-neutral-600">
        <div>
          <p className="font-bold">DIRECT ALL INQUIRIES TO:</p>
          <p className="text-black">ALREADY ARRIVED LOGISTICS INC</p>
          <p>PHONE: 510-330-9581</p>
          <p>EMAIL: Alreadyarrivedlogistics@gmail.com</p>
        </div>
        <p className="text-xs font-bold text-black">THANK YOU FOR YOUR BUSINESS!</p>
      </div>
    </div>
  )
}

/** YG 模版（YG Trucking LLC，粉色） */
function YgEditor({ values, setField, setLines, invoiceDateDisabled }: EditorProps) {
  const total = sumLines(values.lines)
  const amount = total == null ? "$0.00" : fmtMoney(String(total))

  return (
    <div>
      {/* 页眉粉色横条 */}
      <div className="flex items-center justify-between bg-[#F9CBD3] px-4 py-2">
        <span className="text-base font-bold">YG Trucking LLC</span>
        <span className="text-base">Invoice</span>
      </div>

      {/* 地址（左） + Date/Invoice# 2×2 小表（右） */}
      <div className="mt-3 flex items-start justify-between">
        <div className="pt-1 text-xs leading-5">
          <p>PO Box 6213</p>
          <p>Hayward CA 94545</p>
        </div>
        <div className="border border-black text-xs">
          <div className="grid grid-cols-2">
            <div className="border-r border-b border-black px-3 py-1 font-bold">Date</div>
            <div className="border-b border-black px-3 py-1 font-bold">Invoice #</div>
            <div className="border-r border-black p-0.5">
              <Input
                type="date"
                value={values.invoice_date}
                onChange={(e) => setField("invoice_date", e.target.value)}
                disabled={invoiceDateDisabled}
                title={invoiceDateDisabled ? "新建时留空，保存后可编辑" : undefined}
                className={`${tplDateCls} w-full rounded-none border-0 focus-visible:ring-0`}
              />
            </div>
            <div className="p-0.5">
              <Input
                value={values.invoice_number}
                onChange={(e) => setField("invoice_number", e.target.value)}
                placeholder="留空自动生成"
                className={`${tplInputCls} w-full rounded-none border-0 focus-visible:ring-0`}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Bill To 方框 */}
      <div className="mt-3 w-72 border border-black p-2">
        <p className="text-xs">Bill To:</p>
        <Input
          value={values.bill_to}
          onChange={(e) => setField("bill_to", e.target.value)}
          placeholder="客户名"
          className={`${tplInputCls} mt-1 rounded-none border-0 px-0 focus-visible:ring-0`}
        />
      </div>

      {/* 分页标记 */}
      <p className="mt-3 text-center text-xs">Page 1 of 1</p>

      {/* 明细表（可增删多行，Amount 自动 = Qty × Rate） */}
      <div className="mt-1 border border-black text-xs">
        <div className="grid grid-cols-[1fr_64px_96px_104px_28px] bg-[#F9CBD3] text-center font-bold">
          <div className="border-r border-black px-2 py-1.5">Description</div>
          <div className="border-r border-black px-2 py-1.5">Qty</div>
          <div className="border-r border-black px-2 py-1.5">Rate</div>
          <div className="border-r border-black px-2 py-1.5">Amount</div>
          <div />
        </div>
        {values.lines.map((line, index) => {
          const effective = lineAmountValue(line)
          const lineAmount = effective == null ? "" : fmtMoney(String(effective))
          const patch = (part: Partial<FormLine>) =>
            setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...part } : l)))
          return (
            <div key={index} className="grid grid-cols-[1fr_64px_96px_104px_28px] border-t border-black">
              <div className="border-r border-black p-0.5">
                <Input
                  value={line.description}
                  onChange={(e) => patch({ description: e.target.value })}
                  placeholder="如 Load# 124590"
                  className={`${tplInputCls} w-full rounded-none border-0 focus-visible:ring-0`}
                />
              </div>
              <div className="border-r border-black p-0.5">
                <Input
                  value={line.quantity}
                  onChange={(e) => patch({ quantity: e.target.value })}
                  placeholder="1"
                  className={`${tplInputCls} w-full rounded-none border-0 text-center focus-visible:ring-0`}
                />
              </div>
              <div className="border-r border-black p-0.5">
                <Input
                  value={line.unitPrice}
                  onChange={(e) => patch({ unitPrice: e.target.value })}
                  placeholder="0.00"
                  className={`${tplInputCls} w-full rounded-none border-0 text-right focus-visible:ring-0`}
                />
              </div>
              <div className="flex items-center justify-end border-r border-black px-2 py-1.5 font-medium">
                {lineAmount}
              </div>
              <div className="flex items-center justify-center">
                <RemoveLineButton onRemove={() => setLines((prev) => prev.filter((_, i) => i !== index))} />
              </div>
            </div>
          )
        })}
        <div className="h-40 border-t border-black" />
        {/* Total 行 */}
        <div className="grid grid-cols-[1fr_64px_96px_104px_28px] border-t border-black text-center">
          <div className="px-2 py-1.5">Thank you for your business</div>
          <div className="border-r border-black px-2 py-1.5 font-bold">Total</div>
          <div className="border-r border-black" />
          <div className="border-r border-black px-2 py-1.5 text-right font-bold">{amount}</div>
          <div />
        </div>
        {/* Balance Due 行 */}
        <div className="grid grid-cols-[1fr_104px_28px] border-t border-black">
          <div className="px-2 py-1.5 text-right text-sm font-bold">Balance Due</div>
          <div className="border-l border-black px-2 py-1.5 text-right text-sm font-bold">{amount}</div>
          <div className="border-l border-black" />
        </div>
      </div>
      <LineActions onAdd={() => setLines((prev) => [...prev, emptyLine()])} />

      {/* 页脚 2×2 小表 */}
      <div className="mt-6 w-80 border border-black text-xs">
        <div className="grid grid-cols-2">
          <div className="border-r border-b border-black px-3 py-1 font-bold">Phone#</div>
          <div className="border-b border-black px-3 py-1 font-bold">Email:</div>
          <div className="border-r border-black px-3 py-1">(707) 293-4042</div>
          <div className="px-3 py-1">dispatch@ygtrucking.llc</div>
        </div>
      </div>
    </div>
  )
}

/** 无专属模版公司的普通编辑器 */
function FallbackEditor({ values, setField, setLines, invoiceDateDisabled }: EditorProps) {
  const fields: Array<{ key: keyof Omit<FormValues, "lines">; label: string; type?: "date" }> = [
    { key: "invoice_number", label: "Invoice Number" },
    { key: "invoice_date", label: "Invoice 日期", type: "date" },
    { key: "bill_to", label: "Bill To" },
    { key: "broker_load_number", label: "Load #" },
  ]
  return (
    <div>
      <p className="mb-3 text-xs text-muted-foreground">
        该公司暂无专属 PDF 模版，以下开票信息仅保存记录（可在 Excel 清单中导出）
      </p>
      <div className="grid grid-cols-4 gap-3">
        {fields.map((f) => (
          <div key={f.key} className="space-y-1">
            <Label className="text-xs">{f.label}</Label>
            <Input
              type={f.type === "date" ? "date" : "text"}
              value={values[f.key]}
              onChange={(e) => setField(f.key, e.target.value)}
              disabled={invoiceDateDisabled && f.key === "invoice_date"}
              title={
                invoiceDateDisabled && f.key === "invoice_date"
                  ? "新建时留空，保存后可编辑"
                  : undefined
              }
              className={tplInputCls}
            />
          </div>
        ))}
      </div>
      {/* 明细行（可增删） */}
      <div className="mt-3 space-y-2">
        {values.lines.map((line, index) => (
          <div key={index} className="flex items-center gap-2">
            <Input
              value={line.description}
              onChange={(e) =>
                setLines((prev) => prev.map((l, i) => (i === index ? { ...l, description: e.target.value } : l)))
              }
              placeholder="明细描述"
              className={`${tplInputCls} flex-1`}
            />
            <Input
              value={line.amount}
              onChange={(e) =>
                setLines((prev) => prev.map((l, i) => (i === index ? { ...l, amount: e.target.value } : l)))
              }
              placeholder="金额"
              className={`${tplInputCls} w-28 text-right`}
            />
            <RemoveLineButton onRemove={() => setLines((prev) => prev.filter((_, i) => i !== index))} />
          </div>
        ))}
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium">
            合计：{sumLines(values.lines) == null ? "$0.00" : fmtMoney(String(sumLines(values.lines)))}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => setLines((prev) => [...prev, emptyLine()])}
          >
            + 添加明细行
          </Button>
        </div>
      </div>
    </div>
  )
}

/** 编辑回显：把接口返回的明细行转成表单结构 */
function initLines(data: RowData): FormLine[] {
  const raw = Array.isArray(data?.accounting_invoice_lines) ? data.accounting_invoice_lines : []
  return raw.map((line) => {
    const l = line as Record<string, unknown>
    return {
      description: str(l.description),
      quantity: l.quantity == null ? "" : String(l.quantity),
      unitPrice: l.unit_price == null ? "" : String(l.unit_price),
      amount: l.amount == null ? "" : String(l.amount),
    }
  })
}

export function AccountingInvoiceForm({ data, onSuccess, onCancel, cancelLabel = "取消" }: AccountingInvoiceFormProps) {
  const [loading, setLoading] = React.useState(false)
  const [savedId, setSavedId] = React.useState<string | null>(null)
  const [savedInfo, setSavedInfo] = React.useState<{ id: string; invoiceNumber: string } | null>(null)

  const [values, setValues] = React.useState<FormValues>(() => ({
    company: str(data?.company),
    invoice_number: str(data?.invoice_number),
    invoice_date: dateStr(data?.invoice_date),
    broker_load_number: str(data?.broker_load_number),
    bill_to: str(data?.bill_to),
    lines: initLines(data),
    pickup_date: dateStr(data?.pickup_date),
    pickup_company: str(data?.pickup_company),
    pickup_address: str(data?.pickup_address),
    drop_date: dateStr(data?.drop_date),
    drop_company: str(data?.drop_company),
    drop_address: str(data?.drop_address),
  }))

  const setField = React.useCallback((key: keyof Omit<FormValues, "lines">, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }))
  }, [])

  // 明细行独立派发器（编辑器直接对 lines 数组做增删改）
  const setLines = React.useCallback<React.Dispatch<React.SetStateAction<FormLine[]>>>(
    (action) => {
      setValues((prev) => ({
        ...prev,
        lines: typeof action === 'function' ? action(prev.lines) : action,
      }))
    },
    []
  )

  const effectiveId = data?.id != null ? String(data.id) : savedId
  const isEditing = effectiveId != null

  const handlePrint = () => {
    if (!effectiveId) return
    if (!ACCOUNTING_PDF_TEMPLATE_COMPANIES.includes(values.company)) {
      toast.error(`公司「${values.company || "未选择"}」暂无 PDF 模版`)
      return
    }
    openPdf(`/api/finance/accounting-invoices/${effectiveId}/pdf`)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!values.company) {
      toast.error("请选择公司")
      return
    }
    setLoading(true)
    try {
      const dateOrNull = (v: string) => (v.trim() === "" ? null : v.trim())

      // 明细行：Amount = Qty × Rate（齐全时自动算，与界面显示同一规则）
      const linesPayload = values.lines.map((line) => ({
        description: line.description.trim() || null,
        quantity: toNumber(line.quantity),
        unit_price: toNumber(line.unitPrice),
        amount: lineAmountValue(line),
      }))
      const linesTotal = (() => {
        let total = 0
        let has = false
        for (const line of linesPayload) {
          if (line.amount == null) continue
          total += line.amount
          has = true
        }
        return has ? Math.round(total * 100) / 100 : null
      })()

      const payload = {
        company: values.company,
        invoice_number: values.invoice_number.trim(),
        invoice_date: dateOrNull(values.invoice_date),
        broker_load_number: values.broker_load_number.trim() || null,
        bill_to: values.bill_to.trim() || null,
        invoice_price: linesTotal,
        lines: linesPayload,
        pickup_date: dateOrNull(values.pickup_date),
        pickup_company: values.pickup_company.trim() || null,
        pickup_address: values.pickup_address.trim() || null,
        drop_date: dateOrNull(values.drop_date),
        drop_company: values.drop_company.trim() || null,
        drop_address: values.drop_address.trim() || null,
      }

      const url = isEditing
        ? `/api/finance/accounting-invoices/${effectiveId}`
        : "/api/finance/accounting-invoices"
      const result = await fetchJson<Record<string, unknown>>(url, {
        method: isEditing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const recordId = result.id != null ? String(result.id) : effectiveId
      const invoiceNumber = String(result.invoice_number ?? values.invoice_number)
      if (recordId) setSavedId(recordId)
      setSavedInfo({ id: recordId ?? "", invoiceNumber })
      toast.success(isEditing ? "已更新" : `已保存：${invoiceNumber}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败")
    } finally {
      setLoading(false)
    }
  }

  const editorProps: EditorProps = {
    values,
    setField,
    setLines,
    // 新建（尚未保存）时 Invoice 日期保持为空且不可编辑；保存后进入编辑态可填写
    invoiceDateDisabled: !isEditing,
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {/* 公司选择（决定模版） */}
      <div className="flex items-center gap-3">
        <Label className="shrink-0 text-sm">
          公司 <span className="text-destructive">*</span>
        </Label>
        <Select value={values.company} onValueChange={(v) => setField("company", v)}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="选择公司（决定 PDF 模版与发票号前缀）" />
          </SelectTrigger>
          <SelectContent>
            {ACCOUNTING_COMPANY_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
                {ACCOUNTING_PDF_TEMPLATE_COMPANIES.includes(opt.value) ? "（有模版）" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* 模版编辑器 / 占位提示 */}
      {!values.company ? (
        <div className="flex min-h-[200px] items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
          请先选择公司，将呈现该公司的 Invoice 模版
        </div>
      ) : values.company === "AA" ? (
        <AaEditor {...editorProps} />
      ) : values.company === "YG" ? (
        <YgEditor {...editorProps} />
      ) : (
        <FallbackEditor {...editorProps} />
      )}


      {/* 操作区 */}
      {savedInfo ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3">
          <span className="flex items-center gap-2 text-sm font-medium text-emerald-700">
            <CheckCircle2 className="h-4 w-4" />
            已保存：{savedInfo.invoiceNumber}
          </span>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handlePrint}
              disabled={!ACCOUNTING_PDF_TEMPLATE_COMPANIES.includes(values.company)}
              title={
                ACCOUNTING_PDF_TEMPLATE_COMPANIES.includes(values.company)
                  ? "新标签页打开 PDF"
                  : "该公司暂无 PDF 模版"
              }
            >
              <Printer className="mr-2 h-4 w-4" />
              打印 PDF
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setSavedInfo(null)}>
              继续编辑
            </Button>
            <Button type="button" size="sm" onClick={() => onSuccess?.()}>
              完成
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onCancel?.()} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button type="submit" disabled={loading || !values.company}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEditing ? "更新" : "保存"}
          </Button>
        </div>
      )}
    </form>
  )
}
