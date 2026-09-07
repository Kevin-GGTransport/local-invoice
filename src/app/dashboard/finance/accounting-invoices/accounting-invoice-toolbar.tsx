"use client"

/**
 * 陆运账单工具栏（状态 Tab + 筛选/搜索区）
 * 吸顶显示：sticky 于顶部导航栏（64px）下方；通过 onHeightChange 回报自身高度，
 * 供父级计算表格滚动容器的 max-height。
 */

import React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ChevronDown, RotateCcw, Search } from "lucide-react"
import { ACCOUNTING_BILLING_CATEGORY_OPTIONS } from "@/lib/finance/accounting-invoice-companies"

export type InvoiceTab = "all" | "unsent" | "negative" | "unmatched_paid" | "with_deduction"

export type CompanyOption = { code: string; name: string; has_active_template: boolean }

const INVOICE_TABS: readonly (readonly [InvoiceTab, string])[] = [
  ["all", "全部账单"],
  ["unsent", "未发账单"],
  ["negative", "负数账单"],
  ["unmatched_paid", "已收未平"],
  ["with_deduction", "有扣钱"],
]

type AccountingInvoiceToolbarProps = {
  invoiceTab: InvoiceTab
  onInvoiceTabChange: (tab: InvoiceTab) => void
  companies: string[]
  companyOptions: CompanyOption[]
  onToggleCompany: (value: string, checked: boolean) => void
  billingCategory: string
  onBillingCategoryChange: (value: string) => void
  dateFrom: string
  dateTo: string
  onDateFromChange: (value: string) => void
  onDateToChange: (value: string) => void
  filterYear: number
  onFilterYearCommit: (year: number) => void
  activeMonth: number | null
  onSelectMonth: (year: number, month: number) => void
  onClearMonth: () => void
  brokerInput: string
  onBrokerInputChange: (value: string) => void
  searchInput: string
  onSearchInputChange: (value: string) => void
  onApplySearch: () => void
  onResetFilters: () => void
  onHeightChange: (height: number) => void
  /** 渲染在状态 Tab 行右侧的插槽（如视图切换、列设置菜单） */
  rightSlot?: React.ReactNode
}

export function AccountingInvoiceToolbar({
  invoiceTab,
  onInvoiceTabChange,
  companies,
  companyOptions,
  onToggleCompany,
  billingCategory,
  onBillingCategoryChange,
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  filterYear,
  onFilterYearCommit,
  activeMonth,
  onSelectMonth,
  onClearMonth,
  brokerInput,
  onBrokerInputChange,
  searchInput,
  onSearchInputChange,
  onApplySearch,
  onResetFilters,
  onHeightChange,
  rightSlot,
}: AccountingInvoiceToolbarProps) {
  const stickyRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const el = stickyRef.current
    if (!el) return
    const report = () => onHeightChange(el.offsetHeight)
    report()
    const observer = new ResizeObserver(report)
    observer.observe(el)
    return () => observer.disconnect()
  }, [onHeightChange])

  return (
    <div
      ref={stickyRef}
      className="sticky top-16 z-30 overflow-hidden rounded-xl border bg-card shadow-sm"
    >
      {/* 状态 Tab + 右侧插槽（视图/列设置） */}
      <div className="bg-slate-950 px-3 sm:px-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap" role="tablist" aria-label="账单状态">
          {INVOICE_TABS.map(([value, label]) => {
            const active = invoiceTab === value
            return (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={active}
                className={`relative px-4 py-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-300 ${
                  active ? "text-amber-300" : "text-slate-400 hover:text-slate-100"
                }`}
                onClick={() => onInvoiceTabChange(value)}
              >
                {label}
                {active && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-amber-400"
                  />
                )}
              </button>
            )
          })}
          </div>
          {rightSlot && (
            <div className="flex shrink-0 items-center gap-1.5 py-2">{rightSlot}</div>
          )}
        </div>
      </div>

      {/* 筛选与搜索 */}
      <div className="border-t bg-muted/30 px-3 py-3 sm:px-4">
        <div className="flex flex-col gap-2 2xl:flex-row 2xl:flex-wrap 2xl:items-center 2xl:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 w-full justify-between bg-background sm:w-[136px]"
                >
                  {companies.length > 0 ? `公司 ${companies.length}` : "全部公司"}
                  <ChevronDown className="ml-1 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {companyOptions.map((opt) => (
                  <DropdownMenuCheckboxItem
                    key={opt.code}
                    checked={companies.includes(opt.code)}
                    onCheckedChange={(checked) => onToggleCompany(opt.code, checked === true)}
                    onSelect={(e) => e.preventDefault()}
                  >
                    {opt.name}（{opt.code}）
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <Select
              value={billingCategory || "__all__"}
              onValueChange={(v) => onBillingCategoryChange(v === "__all__" ? "" : v)}
            >
              <SelectTrigger
                className="h-9 w-full bg-background sm:w-[150px]"
                aria-label="账单分类"
              >
                <SelectValue placeholder="账单分类" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">全部分类</SelectItem>
                {ACCOUNTING_BILLING_CATEGORY_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {invoiceTab !== "unsent" && (
              <div
                aria-label="时间筛选"
                className="flex w-full min-w-0 flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1 shadow-xs sm:w-auto"
              >
                <span className="shrink-0 px-1 text-xs font-medium text-muted-foreground">
                  Invoice日期
                </span>

                <Input
                  type="date"
                  aria-label="开始日期"
                  className="h-7 min-w-24 flex-1 border-0 px-1 text-xs shadow-none focus-visible:border-transparent focus-visible:ring-0 sm:w-32"
                  value={dateFrom}
                  onChange={(e) => onDateFromChange(e.target.value)}
                />
                <span className="text-xs text-muted-foreground">至</span>
                <Input
                  type="date"
                  aria-label="结束日期"
                  className="h-7 min-w-24 flex-1 border-0 px-1 text-xs shadow-none focus-visible:border-transparent focus-visible:ring-0 sm:w-32"
                  value={dateTo}
                  onChange={(e) => onDateToChange(e.target.value)}
                />
              </div>
            )}
          </div>

          {invoiceTab !== "unsent" && (
            <div className="flex w-full flex-wrap items-center gap-1.5" role="group" aria-label="Invoice 月份快捷筛选">
              <label htmlFor="invoice-filter-year" className="text-xs font-medium text-muted-foreground">年份</label>
              <Input
                id="invoice-filter-year"
                type="number"
                min={1900}
                max={9999}
                className="h-11 w-24"
                key={filterYear}
                defaultValue={filterYear}
                onBlur={(event) => {
                  const year = Number(event.target.value)
                  if (!Number.isInteger(year) || year < 1900 || year > 9999) {
                    event.target.value = String(filterYear)
                    return
                  }
                  onFilterYearCommit(year)
                }}
                onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur() }}
              />
              <Button type="button" variant={!dateFrom && !dateTo ? "default" : "outline"}
                className={`min-h-11 ${!dateFrom && !dateTo ? "bg-amber-500 text-slate-950 hover:bg-amber-400 focus-visible:ring-amber-300/50" : ""}`}
                aria-pressed={!dateFrom && !dateTo}
                onClick={onClearMonth}>
                全部月份
              </Button>
              {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => (
                <Button key={month} type="button" className={`min-h-11 min-w-11 px-2 ${activeMonth === month ? "bg-amber-500 text-slate-950 hover:bg-amber-400 focus-visible:ring-amber-300/50" : ""}`}
                  variant={activeMonth === month ? "default" : "outline"}
                  aria-pressed={activeMonth === month}
                  aria-label={`${filterYear}年${month}月`}
                  onClick={() => onSelectMonth(filterYear, month)}>
                  {month}月
                </Button>
              ))}
            </div>
          )}

          <div className="flex w-full min-w-0 flex-col gap-2 sm:flex-row 2xl:ml-auto 2xl:w-auto 2xl:flex-1">
            <div className="flex h-10 w-full min-w-0 items-center gap-2 rounded-lg border border-input bg-background px-3 shadow-xs focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/30 sm:w-64 sm:shrink-0">
              <label htmlFor="broker-search" className="shrink-0 text-xs text-muted-foreground">
                客户 / BROKER
              </label>
              <Input
                id="broker-search"
                className="h-8 min-w-0 flex-1 rounded-none border-0 px-0 text-sm shadow-none focus-visible:border-transparent focus-visible:ring-0"
                placeholder="输入客户名称"
                value={brokerInput}
                onChange={(e) => onBrokerInputChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onApplySearch()
                }}
              />
            </div>
            <div className="flex h-10 w-full min-w-0 items-center gap-1 rounded-lg border border-input bg-background p-1 shadow-xs transition-[border-color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/30 sm:flex-1">
              <Search
                className="ml-1.5 size-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                aria-label="搜索账单"
                className="h-8 min-w-0 flex-1 rounded-none border-0 px-1 text-sm shadow-none focus-visible:border-transparent focus-visible:ring-0"
                placeholder="发票号 / 货号 / Load# / 备注"
                value={searchInput}
                onChange={(e) => onSearchInputChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onApplySearch()
                }}
              />
              <Button size="sm" className="h-8 shrink-0" onClick={onApplySearch}>
                搜索
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 shrink-0 text-muted-foreground"
                onClick={onResetFilters}
                title="清空筛选条件"
                aria-label="清空筛选条件"
              >
                <RotateCcw className="size-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
