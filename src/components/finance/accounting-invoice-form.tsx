"use client"

/**
 * 陆运账单 开票表单（结构化表单 + 模版实时预览）
 * 左侧维护 PDF 打印字段；右侧按公司当前启用模版实时渲染最终效果。
 * 无启用模版的公司仅保存记录（可在 Excel 清单中导出），不出 PDF。
 */

import React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"
import { ArrowDown, ArrowUp, Loader2, Printer, CheckCircle2, Plus, Trash2 } from "lucide-react"
import { fetchJson } from "@/lib/api/client"
import { openPdf } from "@/lib/utils/open-pdf"
import { TemplatePreview } from "@/components/templates/template-preview"
import { renderTemplateData } from "@/lib/templates/render-template-data"
import {
  ACCOUNTING_BILLING_CATEGORY_OPTIONS,
  billingCategoryPayloadValue,
  fromBillingCategorySelectValue,
  toBillingCategorySelectValue,
} from "@/lib/finance/accounting-invoice-companies"
import type {
  TemplateBinding,
  TemplateGrid,
  TemplatePageConfig,
} from "@/lib/templates/types"
import {
  AA_COLD_CHAIN_COMPANY,
  AA_COLD_CHAIN_RENDERER_KEY,
} from "@/lib/finance/accounting-invoice-renderers"
import { buildAaColdChainGrid } from "@/lib/templates/aa-cold-chain-template"

type RowData = Record<string, unknown> | null | undefined

interface AccountingInvoiceFormProps {
  /** EntityTable 传入：编辑时有值，新建为 null */
  data?: RowData
  onSuccess?: () => void
  onCancel?: () => void
  /** 取消按钮文案（详情页复用本表单时传"返回列表"） */
  cancelLabel?: string
  /** 弹窗内使用：预览列不做粘性定位，跟随弹窗整体滚动 */
  inDialog?: boolean
}

interface FormLine {
  description: string
  amount: string
  service_date: string
  pickup_address: string
  drop_address_1: string
  drop_address_2: string
  drop_address_3: string
}

interface FormValues {
  company: string
  invoice_template_id: string
  renderer_key: string
  billing_category: string
  contract_price: string
  invoice_number: string
  invoice_date: string
  broker_load_number: string
  bill_to: string
  tonu: boolean
  deduction: string
  lines: FormLine[]
  pickup_date: string
  pickup_company: string
  pickup_address: string
  drop_date: string
  drop_company: string
  drop_address: string
}

interface CompanyOption {
  id: string
  code: string
  name: string
  is_active: boolean
  has_active_template: boolean
}

interface ActiveTemplate {
  id: string
  name: string
  is_default: boolean
  page_config: TemplatePageConfig
  grid_config: TemplateGrid
  binding_config: TemplateBinding
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

function fmtMoney(value: string | number | null): string {
  const n = typeof value === "number" ? value : toNumber(String(value ?? ""))
  if (n == null) return ""
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function emptyLine(): FormLine {
  return {
    description: "",
    amount: "",
    service_date: "",
    pickup_address: "",
    drop_address_1: "",
    drop_address_2: "",
    drop_address_3: "",
  }
}

/** 行金额：普通明细的金额或冷链运输的 RATE。 */
function lineAmountValue(line: FormLine): number | null {
  return toNumber(line.amount)
}

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

function formatDateInput(v: string): string {
  if (!v) return ""
  const [y, m, d] = v.split("-")
  if (!y || !m || !d) return ""
  return `${m}/${d}/${y}`
}

/** 编辑回显：把接口返回的明细行转成表单结构 */
function initLines(data: RowData): FormLine[] {
  const raw = Array.isArray(data?.accounting_invoice_lines) ? data.accounting_invoice_lines : []
  return raw.map((line) => {
    const l = line as Record<string, unknown>
    return {
      description: str(l.description),
      amount: l.amount == null ? "" : String(l.amount),
      service_date: dateStr(l.service_date),
      pickup_address: str(l.pickup_address),
      drop_address_1: str(l.drop_address_1),
      drop_address_2: str(l.drop_address_2),
      drop_address_3: str(l.drop_address_3),
    }
  })
}

export function AccountingInvoiceForm({ data, onSuccess, onCancel, cancelLabel = "取消", inDialog = false }: AccountingInvoiceFormProps) {
  const [loading, setLoading] = React.useState(false)
  const [savedId, setSavedId] = React.useState<string | null>(null)
  const [savedInfo, setSavedInfo] = React.useState<{ id: string; invoiceNumber: string } | null>(null)
  const [companies, setCompanies] = React.useState<CompanyOption[]>([])
  const [templates, setTemplates] = React.useState<ActiveTemplate[]>([])
  const [templateLoading, setTemplateLoading] = React.useState(false)

  const [values, setValues] = React.useState<FormValues>(() => ({
    company: str(data?.company),
    invoice_template_id: str(data?.invoice_template_id),
    renderer_key: str(data?.renderer_key),
    billing_category: str(data?.billing_category),
    contract_price: str(data?.contract_price),
    invoice_number: str(data?.invoice_number),
    invoice_date: dateStr(data?.invoice_date),
    broker_load_number: str(data?.broker_load_number),
    bill_to: str(data?.bill_to),
    tonu: data?.tonu === true,
    deduction: str(data?.deduction),
    lines: initLines(data),
    pickup_date: dateStr(data?.pickup_date),
    pickup_company: str(data?.pickup_company),
    pickup_address: str(data?.pickup_address),
    drop_date: dateStr(data?.drop_date),
    drop_company: str(data?.drop_company),
    drop_address: str(data?.drop_address),
  }))

  const setField = React.useCallback((key: keyof Omit<FormValues, "lines" | "tonu">, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }))
  }, [])

  const setLines = React.useCallback<React.Dispatch<React.SetStateAction<FormLine[]>>>(
    (action) => {
      setValues((prev) => ({
        ...prev,
        lines: typeof action === "function" ? action(prev.lines) : action,
      }))
    },
    []
  )

  const effectiveId = data?.id != null ? String(data.id) : savedId
  const isEditing = effectiveId != null

  // 公司下拉：新建只可选启用公司；编辑时当前公司（即使已停用）保持在列表里
  React.useEffect(() => {
    void fetchJson<CompanyOption[]>("/api/companies")
      .then((list) => setCompanies(list))
      .catch(() => toast.error("加载公司列表失败"))
  }, [])

  // 选中公司 → 拉取全部已发布模版，未指定时选默认版
  React.useEffect(() => {
    let cancelled = false
    const company = values.company
    void (async () => {
      setTemplateLoading(true)
      const list = company
        ? await fetchJson<ActiveTemplate[]>(
            `/api/invoice-templates/active?company=${encodeURIComponent(company)}`
          ).catch(() => [])
        : []
      if (!cancelled) {
        setTemplates(list)
        setValues((prev) => {
          if (company === AA_COLD_CHAIN_COMPANY && prev.renderer_key === AA_COLD_CHAIN_RENDERER_KEY) return prev
          if (list.some((item) => item.id === prev.invoice_template_id)) return { ...prev, renderer_key: "" }
          return {
            ...prev,
            renderer_key: "",
            invoice_template_id: list.find((item) => item.is_default)?.id ?? list[0]?.id ?? "",
          }
        })
        setTemplateLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [values.company])

  const activeTemplate = templates.find((item) => item.id === values.invoice_template_id) ?? null
  const isColdChain = values.company === AA_COLD_CHAIN_COMPANY && values.renderer_key === AA_COLD_CHAIN_RENDERER_KEY
  const selectedLayoutValue = isColdChain
    ? `builtin:${AA_COLD_CHAIN_RENDERER_KEY}`
    : values.invoice_template_id ? `template:${values.invoice_template_id}` : ""

  const companyHasTemplate = isColdChain || (
    companies.find((c) => c.code === values.company)?.has_active_template ?? false
  )

  const handlePrint = () => {
    if (!effectiveId) return
    if (!companyHasTemplate) {
      toast.error(`公司「${values.company || "未选择"}」暂无启用的 PDF 模版`)
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

      const linesPayload = values.lines.map((line) => ({
        description: line.description.trim() || null,
        quantity: null,
        unit_price: null,
        amount: lineAmountValue(line),
        service_date: dateOrNull(line.service_date),
        pickup_address: line.pickup_address.trim() || null,
        drop_address_1: line.drop_address_1.trim() || null,
        drop_address_2: line.drop_address_2.trim() || null,
        drop_address_3: line.drop_address_3.trim() || null,
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
        invoice_template_id: isColdChain ? null : values.invoice_template_id || null,
        renderer_key: isColdChain ? AA_COLD_CHAIN_RENDERER_KEY : null,
        billing_category: billingCategoryPayloadValue(values.billing_category),
        ...(!isEditing ? { contract_price: toNumber(values.contract_price) } : {}),
        invoice_number: values.invoice_number.trim(),
        broker_load_number: values.broker_load_number.trim() || null,
        bill_to: values.bill_to.trim() || null,
        tonu: values.tonu,
        deduction: values.deduction.trim() || null,
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

  // —— 实时预览数据（与 PDF 服务同一格式化规则） ——
  const previewGrid = React.useMemo(() => {
    const total = sumLines(values.lines)
    if (isColdChain) {
      return buildAaColdChainGrid({
        invoiceNumber: values.invoice_number,
        invoiceDate: formatDateInput(values.invoice_date),
        loadNumber: values.broker_load_number,
        billTo: values.bill_to,
        total: total == null ? "$0.00" : fmtMoney(total),
        lines: values.lines.map((line) => ({
          serviceDate: formatDateInput(line.service_date),
          pickupAddress: line.pickup_address,
          dropAddress1: line.drop_address_1,
          dropAddress2: line.drop_address_2,
          dropAddress3: line.drop_address_3,
          amount: lineAmountValue(line) == null ? "" : fmtMoney(lineAmountValue(line)),
        })),
      })
    }
    if (!activeTemplate) return null
    return renderTemplateData(activeTemplate.grid_config, activeTemplate.binding_config, {
      invoiceNumber: values.invoice_number,
      invoiceDate: formatDateInput(values.invoice_date),
      loadNumber: values.broker_load_number,
      billTo: values.bill_to,
      total: total == null ? "$0.00" : fmtMoney(total),
      pickupDate: formatDateInput(values.pickup_date),
      pickupCompany: values.pickup_company,
      pickupAddress: values.pickup_address,
      dropDate: formatDateInput(values.drop_date),
      dropCompany: values.drop_company,
      dropAddress: values.drop_address,
      lines: values.lines.map((l) => ({
        description: l.description,
        quantity: "",
        unitPrice: "",
        amount: lineAmountValue(l) == null ? "" : fmtMoney(lineAmountValue(l)),
      })),
    })
  }, [activeTemplate, isColdChain, values])

  const inputCls = "bg-background"

  const isLegacyBillingCategory =
    values.billing_category !== "" &&
    !ACCOUNTING_BILLING_CATEGORY_OPTIONS.some((option) => option.value === values.billing_category)

  const renderField = (
    key: keyof Omit<FormValues, "lines" | "company" | "tonu">,
    label: string,
    type: "text" | "date" = "text",
    placeholder?: string,
  ) => (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input
        type={type}
        value={values[key]}
        onChange={(e) => setField(key, e.target.value)}
        disabled={key === "invoice_date"}
        title={key === "invoice_date" ? "Invoice 日期由发账单操作设置，设置后不可修改" : undefined}
        placeholder={placeholder}
        className={inputCls}
      />
    </div>
  )

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {/* 公司与模版是一组联动选择 */}
      <div className="grid gap-3 rounded-xl border bg-muted/30 p-3 sm:grid-cols-2">
        <div className="space-y-1.5">
        <Label className="text-sm">
          公司 <span className="text-destructive">*</span>
        </Label>
        <Select value={values.company} onValueChange={(v) => setField("company", v)}>
          <SelectTrigger className="bg-background">
            <SelectValue placeholder="选择公司（决定 PDF 模版与发票号前缀）" />
          </SelectTrigger>
          <SelectContent>
            {companies
              .filter((c) => c.is_active || c.code === values.company)
              .map((opt) => (
                <SelectItem key={opt.id} value={opt.code}>
                  {opt.name}（{opt.code}）{opt.has_active_template ? "（有模版）" : ""}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm">账单模版</Label>
          <Select
            value={selectedLayoutValue}
            onValueChange={(value) => {
              if (value === `builtin:${AA_COLD_CHAIN_RENDERER_KEY}`) {
                setValues((prev) => ({ ...prev, renderer_key: AA_COLD_CHAIN_RENDERER_KEY, invoice_template_id: "" }))
                return
              }
              setValues((prev) => ({ ...prev, renderer_key: "", invoice_template_id: value.replace(/^template:/, "") }))
            }}
            disabled={!values.company || (templates.length === 0 && values.company !== AA_COLD_CHAIN_COMPANY)}
          >
            <SelectTrigger className="bg-background">
              <SelectValue placeholder={values.company ? "该公司暂无可用版式" : "请先选择公司"} />
            </SelectTrigger>
            <SelectContent>
              {values.company === AA_COLD_CHAIN_COMPANY && (
                <SelectItem value={`builtin:${AA_COLD_CHAIN_RENDERER_KEY}`}>
                  AA 冷链 · 内置
                </SelectItem>
              )}
              {templates.map((template) => (
                <SelectItem key={template.id} value={`template:${template.id}`}>{template.name}{template.is_default ? " · 默认" : ""}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">保存后记住该版式，重打不受默认模版变更影响。</p>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* 左：结构化表单 */}
        <div className="space-y-4">
          <section className="space-y-3 rounded-lg border bg-card p-4">
            <h3 className="text-sm font-semibold">开票信息</h3>
            <div className="grid grid-cols-2 gap-3">
              {isEditing && (
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">总货号（系统分配）</Label>
                  <Input value={str(data?.master_order_number)} disabled className="font-mono" />
                </div>
              )}
              {isEditing && (
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">货号（系统分配）</Label>
                  <Input value={str(data?.order_number)} disabled className="font-mono" />
                </div>
              )}
              {renderField("invoice_number", "Invoice Number", "text", "留空自动按公司前缀生成")}
              {renderField("invoice_date", "Invoice 日期", "date")}
              <div className="space-y-1">
                <Label className="text-xs">合同金额{isEditing ? "（创建后不可修改）" : ""}</Label>
                <Input type="number" step="0.01" value={values.contract_price} onChange={(e) => setField("contract_price", e.target.value)} disabled={isEditing} className={inputCls} />
              </div>
              {renderField("broker_load_number", "Load #")}
              {renderField("bill_to", "客户 / Broker 公司（Bill To）")}
              <div className="space-y-1">
                <Label className="text-xs">账单分类</Label>
                <Select value={toBillingCategorySelectValue(values.billing_category)} onValueChange={(value) => setField("billing_category", fromBillingCategorySelectValue(value))}>
                  <SelectTrigger className={inputCls} aria-label="账单分类"><SelectValue placeholder="选择账单分类" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={toBillingCategorySelectValue("")}>未分类</SelectItem>
                    {isLegacyBillingCategory && <SelectItem value={toBillingCategorySelectValue(values.billing_category)}>{values.billing_category}（历史分类）</SelectItem>}
                    {ACCOUNTING_BILLING_CATEGORY_OPTIONS.map((option) => <SelectItem key={option.value} value={toBillingCategorySelectValue(option.value)}>{option.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">TONU</Label>
                <label className="flex min-h-11 items-center gap-2">
                  <Checkbox checked={values.tonu} onCheckedChange={(checked) => setValues((prev) => ({ ...prev, tonu: checked === true }))} aria-label="TONU（Truck Ordered Not Used）" />
                  <span className="text-xs text-muted-foreground">Truck Ordered Not Used</span>
                </label>
              </div>
              <div className="space-y-1">
                <Label className="text-xs" htmlFor="invoice-deduction">扣钱（说明）</Label>
                <Input id="invoice-deduction" value={values.deduction} onChange={(e) => setField("deduction", e.target.value)} maxLength={200} placeholder="如 RTS、扣款原因（不参与差额计算）" className={inputCls} />
              </div>
            </div>
          </section>

          {isColdChain ? (
          <section className="space-y-3 rounded-lg border border-orange-200 bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold">冷链运输明细</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">每行一趟运输，最多填写三个卸货地址。</p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => setLines((prev) => [...prev, emptyLine()])}>
                <Plus className="mr-1 size-3.5" />
                添加运输
              </Button>
            </div>
            {values.lines.length === 0 && (
              <button
                type="button"
                onClick={() => setLines([emptyLine()])}
                className="w-full rounded-md border border-dashed border-orange-200 bg-orange-50/40 px-4 py-6 text-sm text-muted-foreground hover:bg-orange-50"
              >
                暂无运输明细，点击添加第一趟
              </button>
            )}
            <div className="space-y-3">
              {values.lines.map((line, index) => (
                <div key={index} className="rounded-lg border bg-muted/20 p-3">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-xs font-semibold text-orange-700">运输 {index + 1}</span>
                    <div className="flex items-center gap-1">
                      <Button type="button" variant="ghost" size="icon" className="size-8" disabled={index === 0} aria-label={`上移运输 ${index + 1}`} onClick={() => setLines((prev) => {
                        const next = [...prev]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; return next
                      })}><ArrowUp className="size-3.5" /></Button>
                      <Button type="button" variant="ghost" size="icon" className="size-8" disabled={index === values.lines.length - 1} aria-label={`下移运输 ${index + 1}`} onClick={() => setLines((prev) => {
                        const next = [...prev]; [next[index], next[index + 1]] = [next[index + 1], next[index]]; return next
                      })}><ArrowDown className="size-3.5" /></Button>
                      <Button type="button" variant="ghost" size="icon" className="size-8 text-destructive hover:text-destructive" aria-label={`删除运输 ${index + 1}`} onClick={() => setLines((prev) => prev.filter((_, i) => i !== index))}>
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
                    <div className="space-y-1"><Label className="text-xs">DATE</Label><Input type="date" value={line.service_date} onChange={(e) => setLines((prev) => prev.map((item, i) => i === index ? { ...item, service_date: e.target.value } : item))} className={inputCls} /></div>
                    {([
                      ['pickup_address', 'PU'],
                      ['drop_address_1', 'DEL 1'],
                      ['drop_address_2', 'DEL 2'],
                      ['drop_address_3', 'DEL 3'],
                    ] as const).map(([key, label]) => (
                      <div key={key} className="space-y-1"><Label className="text-xs">{label}</Label><Textarea value={line[key]} maxLength={500} rows={2} onChange={(e) => setLines((prev) => prev.map((item, i) => i === index ? { ...item, [key]: e.target.value } : item))} className="min-h-16 resize-y bg-background" /></div>
                    ))}
                    <div className="space-y-1"><Label className="text-xs">RATE</Label><Input type="number" step="0.01" value={line.amount} onChange={(e) => setLines((prev) => prev.map((item, i) => i === index ? { ...item, amount: e.target.value } : item))} placeholder="0.00" className={`${inputCls} text-right`} /></div>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-end border-t pt-3 text-sm font-semibold">合计：{sumLines(values.lines) == null ? "$0.00" : fmtMoney(sumLines(values.lines))}</div>
          </section>
          ) : null}

          {!isColdChain && <section className="space-y-3 rounded-lg border bg-card p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">明细行</h3>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setLines((prev) => [...prev, emptyLine()])}
              >
                <Plus className="mr-1 size-3.5" />
                添加明细行
              </Button>
            </div>
            {values.lines.length === 0 && (
              <p className="text-xs text-muted-foreground">暂无明细行，至少添加一行用于打印</p>
            )}
            <div className="space-y-2">
              {values.lines.map((line, index) => (
                <div key={index} className="flex items-end gap-2">
                  <div className="flex-1 space-y-1">
                    {index === 0 && <Label className="text-xs">描述</Label>}
                    <Input
                      value={line.description}
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((l, i) => (i === index ? { ...l, description: e.target.value } : l))
                        )
                      }
                      placeholder="如 Carrier Charge"
                      className={inputCls}
                    />
                  </div>
                  <div className="w-36 space-y-1">
                    {index === 0 && <Label className="text-xs">金额</Label>}
                    <Input
                      value={line.amount}
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((l, i) => (i === index ? { ...l, amount: e.target.value } : l))
                        )
                      }
                      placeholder="0.00"
                      className={`${inputCls} text-right`}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-9 shrink-0 text-destructive hover:text-destructive"
                    onClick={() => setLines((prev) => prev.filter((_, i) => i !== index))}
                    aria-label="删除明细行"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
            <div className="flex justify-end">
              <span className="text-sm font-medium">
                合计：{sumLines(values.lines) == null ? "$0.00" : fmtMoney(sumLines(values.lines))}
              </span>
            </div>
          </section>}

          {!isColdChain && <section className="space-y-3 rounded-lg border bg-card p-4">
            <h3 className="text-sm font-semibold">取货 / 交货</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">PICKUPS</p>
                {renderField("pickup_date", "取货日期", "date")}
                {renderField("pickup_company", "取货公司")}
                <div className="space-y-1">
                  <Label className="text-xs">取货地址</Label>
                  <Textarea
                    value={values.pickup_address}
                    onChange={(e) => setField("pickup_address", e.target.value)}
                    className="min-h-[60px] bg-background"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">DROPS</p>
                {renderField("drop_date", "交货日期", "date")}
                {renderField("drop_company", "交货公司")}
                <div className="space-y-1">
                  <Label className="text-xs">交货地址</Label>
                  <Textarea
                    value={values.drop_address}
                    onChange={(e) => setField("drop_address", e.target.value)}
                    className="min-h-[60px] bg-background"
                  />
                </div>
              </div>
            </div>
          </section>}
        </div>

        {/* 右：模版实时预览（整页：粘性定位 + 独立滚动；弹窗：跟随弹窗滚动） */}
        <div
          className={
            inDialog
              ? "space-y-2"
              : "space-y-2 xl:sticky xl:top-20 xl:max-h-[calc(100dvh-6.5rem)] xl:self-start xl:overflow-auto"
          }
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">模版实时预览</h3>
            {templateLoading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
          </div>
          {!values.company ? (
            <div className="flex min-h-[200px] items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
              选择公司后显示 PDF 模版预览
            </div>
          ) : !activeTemplate && !isColdChain ? (
            <div className="flex min-h-[200px] items-center justify-center rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              该公司暂无启用的 PDF 模版
              <br />
              开票信息仅保存记录（可在 Excel 清单中导出）
            </div>
          ) : previewGrid ? (
            <TemplatePreview grid={previewGrid} scale={0.72} />
          ) : null}
        </div>
      </div>

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
              disabled={!companyHasTemplate}
              title={companyHasTemplate ? "新标签页打开 PDF" : "该公司暂无启用的 PDF 模版"}
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
