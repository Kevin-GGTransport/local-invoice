/**
 * 陆运账单 Excel 导入（纯解析层，不依赖 prisma 实例，便于 node:test 单测）
 * - IMPORT_COLUMNS：导入列定义单一来源（模板生成与解析共用，含兼容导出文件的别名表头）
 * - parseAccountingInvoiceImportWorkbook：工作簿 Buffer → 行对象 + 行级错误（不抛行级异常）
 * - planAccountingInvoiceImport：行对象 → upsert 计划（company 存在性 / 编号新旧分区）
 * - generateAccountingInvoiceImportTemplate：导入模板（含填写说明 sheet）
 * 事务执行（逐行 upsert + 货号分配）见 api/finance/accounting-invoices/import/route.ts
 *
 * 语义：按账单编号全量覆盖 —— 文件中出现的每一列都会覆盖对应字段，留空即清空；
 * 未出现的列不导入；明细行、货号、合同金额（仅创建可设）、对账字段等系统维护字段一律不动。
 */

import ExcelJS from "exceljs"
import type { Prisma } from "@prisma/client"
import { accountingInvoiceCreateSchema } from "../validations/accounting-invoice"
import { toInvoiceCreateData, toInvoiceUpdateData } from "./accounting-invoice-input"

export const IMPORT_MAX_BYTES = 5 * 1024 * 1024
export const IMPORT_MAX_ROWS = 2000

/** 文件级错误（无法解析 / 无表头 / 缺必填列 / 超行数上限），route 映射为 400 */
export class ImportFormatError extends Error {}

export interface ImportRowError {
  /** Excel 实际行号（1-based，含表头行） */
  row: number
  message: string
}

/** 导入结果汇总（成功响应的 data） */
export interface ImportSummary {
  total: number
  created: number
  updated: number
}

type ImportColumnType = "text" | "money" | "date" | "boolean"

export interface ImportColumnDef {
  /** 数据库字段名（同 create schema 键） */
  field: string
  /** 模板表头（主匹配名） */
  header: string
  /** 兼容别名（如导出文件回导时的表头） */
  aliases?: string[]
  required?: boolean
  type: ImportColumnType
  width: number
}

/** 导入列定义（18 列 = accountingInvoiceCreateSchema 的全部字段，顺序即模板列序） */
export const IMPORT_COLUMNS: ImportColumnDef[] = [
  { field: "invoice_number", header: "账单编号", aliases: ["Invoice Number"], required: true, type: "text", width: 18 },
  { field: "company", header: "公司", required: true, type: "text", width: 10 },
  { field: "contract_price", header: "合同金额", type: "money", width: 12 },
  { field: "bill_to", header: "Broker公司", type: "text", width: 16 },
  { field: "broker_load_number", header: "Load #", type: "text", width: 12 },
  { field: "billing_category", header: "账单分类", type: "text", width: 12 },
  { field: "tonu", header: "TONU", type: "boolean", width: 8 },
  { field: "deduction", header: "扣钱说明", aliases: ["扣"], type: "text", width: 14 },
  { field: "invoice_price", header: "Invoice 价格", aliases: ["Invoice价格"], type: "money", width: 12 },
  { field: "quantity", header: "数量", type: "money", width: 10 },
  { field: "unit_price", header: "单价", type: "money", width: 10 },
  { field: "description", header: "描述", type: "text", width: 18 },
  { field: "pickup_date", header: "提货日期", type: "date", width: 12 },
  { field: "pickup_company", header: "提货公司", type: "text", width: 14 },
  { field: "pickup_address", header: "提货地址", type: "text", width: 20 },
  { field: "drop_date", header: "送达日期", type: "date", width: 12 },
  { field: "drop_company", header: "送达公司", type: "text", width: 14 },
  { field: "drop_address", header: "送达地址", type: "text", width: 20 },
]

/** 表头扫描范围：模板在第 1 行，导出文件回导时在第 3 行，取前 5 行内命中已知表头最多的一行 */
const HEADER_SCAN_ROWS = 5

/** 单元格转换失败（行级错误），message 为面向用户的中文提示 */
class CellConvertError extends Error {}

/** exceljs 单元格值 → 原始标量（Date 保留；富文本拼接；公式取结果；超链接取文本） */
function cellPrimitive(cell: ExcelJS.Cell): unknown {
  const value = cell.value
  if (value == null) return null
  if (value instanceof Date) return value
  if (typeof value === "object") {
    if ("richText" in value) return value.richText.map((part) => part.text).join("")
    if ("formula" in value) return value.result ?? null
    if ("hyperlink" in value) return value.text ?? null
    return null
  }
  return value
}

function isFormulaErrorValue(value: unknown): boolean {
  return typeof value === "object" && value !== null && "error" in value
}

/** 表头单元格 → 规范名（trim、去尾部 *，必填列的星号标记不影响匹配） */
function headerText(raw: unknown): string {
  if (raw == null) return ""
  if (typeof raw === "string") return raw.trim().replace(/[\s*]+$/, "")
  if (typeof raw === "number" || typeof raw === "boolean") return String(raw)
  return ""
}

function findColumnByHeader(name: string): ImportColumnDef | undefined {
  return IMPORT_COLUMNS.find(
    (col) => col.header === name || col.aliases?.includes(name)
  )
}

function toTextValue(value: unknown): string {
  if (isFormulaErrorValue(value)) throw new CellConvertError("公式计算出错，请改为具体数值")
  if (value == null) return ""
  if (typeof value === "string") return value.trim()
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  throw new CellConvertError("单元格内容无法识别")
}

/** 金额：空 → ''（moneyField preprocess 会转 null），其余透传给 zod 校验数字与范围 */
function toMoneyValue(value: unknown): string | number {
  if (isFormulaErrorValue(value)) throw new CellConvertError("公式计算出错，请改为具体数值")
  if (value == null) return ""
  if (typeof value === "number" || typeof value === "string") return value
  throw new CellConvertError("金额必须为数字")
}

function formatUtcDate(date: Date): string {
  if (Number.isNaN(date.getTime())) throw new CellConvertError("日期格式应为 YYYY-MM-DD")
  const yyyy = date.getUTCFullYear()
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0")
  const dd = String(date.getUTCDate()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}

/** 日期：Date 按 UTC 归一（exceljs 日期序列与写入端 T00:00:00.000Z 对齐）；字符串支持 YYYY-MM-DD / YYYY/M/D */
function toDateStringValue(value: unknown): string {
  if (isFormulaErrorValue(value)) throw new CellConvertError("公式计算出错，请改为具体数值")
  if (value == null) return ""
  if (value instanceof Date) return formatUtcDate(value)
  if (typeof value === "string") {
    const matched = value.trim().match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/)
    if (!matched) throw new CellConvertError("日期格式应为 YYYY-MM-DD")
    const normalized = `${matched[1]}-${matched[2].padStart(2, "0")}-${matched[3].padStart(2, "0")}`
    // 校验真实日历日期（如 2026-02-30 会被 Date 滚动到 3 月）
    const check = new Date(`${normalized}T00:00:00.000Z`)
    if (Number.isNaN(check.getTime()) || check.toISOString().slice(0, 10) !== normalized) {
      throw new CellConvertError("日期不存在，请检查年月日")
    }
    return normalized
  }
  throw new CellConvertError("日期格式应为 YYYY-MM-DD")
}

/** TONU：空 → false（全量覆盖语义下显式置否）；兼容 是/否、Y/N、true/false、1/0 */
function toTonuValue(value: unknown): boolean {
  if (isFormulaErrorValue(value)) throw new CellConvertError("公式计算出错，请改为具体数值")
  if (value == null || value === "") return false
  if (typeof value === "boolean") return value
  if (value === 1) return true
  if (value === 0) return false
  if (typeof value === "string") {
    const text = value.trim().toLowerCase()
    if (["是", "y", "yes", "true", "1"].includes(text)) return true
    if (["否", "n", "no", "false", "0"].includes(text)) return false
  }
  throw new CellConvertError("TONU 只能填 是 或 否")
}

function convertCell(def: ImportColumnDef, cell: ExcelJS.Cell): unknown {
  const raw = cellPrimitive(cell)
  switch (def.type) {
    case "text":
      return toTextValue(raw)
    case "money":
      return toMoneyValue(raw)
    case "date":
      return toDateStringValue(raw)
    case "boolean":
      return toTonuValue(raw)
  }
}

/** 定位表头行：前 5 行内命中已知表头最多的一行（0 命中返回 0） */
function locateHeaderRow(sheet: ExcelJS.Worksheet): number {
  let bestRow = 0
  let bestCount = 0
  const scanTo = Math.min(HEADER_SCAN_ROWS, sheet.rowCount)
  for (let r = 1; r <= scanTo; r++) {
    let count = 0
    sheet.getRow(r).eachCell({ includeEmpty: false }, (cell) => {
      if (findColumnByHeader(headerText(cellPrimitive(cell)))) count += 1
    })
    if (count > bestCount) {
      bestRow = r
      bestCount = count
    }
  }
  return bestRow
}

export interface ParsedImportRow {
  rowNumber: number
  /** create schema 校验通过的字段对象（只含文件中出现的列，空值已归一为 ''/false/null） */
  values: Record<string, unknown>
}

export interface ParsedImportWorkbook {
  rows: ParsedImportRow[]
  rowErrors: ImportRowError[]
  /** 文件中存在但非导入字段的表头（如回导导出文件时的 总货号/支票金额 等） */
  ignoredColumns: string[]
}

export async function parseAccountingInvoiceImportWorkbook(
  buffer: Buffer | ArrayBuffer
): Promise<ParsedImportWorkbook> {
  const workbook = new ExcelJS.Workbook()
  try {
    await workbook.xlsx.load(buffer as ArrayBuffer)
  } catch {
    throw new ImportFormatError("无法解析该文件，请确认为有效的 .xlsx 文件")
  }
  const sheet = workbook.worksheets[0]
  if (!sheet) throw new ImportFormatError("文件中没有工作表")

  const headerRowNumber = locateHeaderRow(sheet)
  if (headerRowNumber === 0) {
    throw new ImportFormatError("未识别到表头，请使用导入模板填写后再上传")
  }

  // 列映射：列号 → 字段定义（列序无关，重复表头取首个）
  const columnByIndex = new Map<number, ImportColumnDef>()
  const ignoredColumns: string[] = []
  const seenFields = new Set<string>()
  sheet.getRow(headerRowNumber).eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const name = headerText(cellPrimitive(cell))
    if (!name) return
    const def = findColumnByHeader(name)
    if (!def) {
      ignoredColumns.push(name)
      return
    }
    if (seenFields.has(def.field)) return
    seenFields.add(def.field)
    columnByIndex.set(colNumber, def)
  })

  const missingRequired = IMPORT_COLUMNS.filter(
    (col) => col.required && !seenFields.has(col.field)
  )
  if (missingRequired.length > 0) {
    throw new ImportFormatError(
      `缺少必填列：${missingRequired.map((col) => col.header).join("、")}，请使用导入模板`
    )
  }

  const rows: ParsedImportRow[] = []
  const rowErrors: ImportRowError[] = []
  const firstSeenNumbers = new Map<string, number>()
  const mappedColumns = [...columnByIndex.entries()]
  let dataRowCount = 0

  for (let r = headerRowNumber + 1; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r)
    // 全空行（含纯空格）跳过，不计行数与错误
    const isEmpty = mappedColumns.every(([colNumber]) => {
      const raw = cellPrimitive(row.getCell(colNumber))
      return raw == null || (typeof raw === "string" && raw.trim() === "")
    })
    if (isEmpty) continue

    dataRowCount += 1
    if (dataRowCount > IMPORT_MAX_ROWS) {
      throw new ImportFormatError(`单次最多导入 ${IMPORT_MAX_ROWS} 行，请分批导入`)
    }

    // 逐列转换（单元格级错误直接计入行错误）
    const values: Record<string, unknown> = {}
    let rowFailed = false
    for (const [colNumber, def] of mappedColumns) {
      try {
        values[def.field] = convertCell(def, row.getCell(colNumber))
      } catch (err) {
        rowFailed = true
        const message = err instanceof CellConvertError ? err.message : "单元格内容无法识别"
        rowErrors.push({ row: r, message: `第 ${r} 行【${def.header}】：${message}` })
      }
    }

    // zod 行校验（必填/长度/金额范围），中文列名取自列定义
    if (!rowFailed) {
      const parsed = accountingInvoiceCreateSchema.safeParse(values)
      if (!parsed.success) {
        rowFailed = true
        for (const issue of parsed.error.issues) {
          const field = String(issue.path[0] ?? "")
          const def = IMPORT_COLUMNS.find((col) => col.field === field)
          rowErrors.push({
            row: r,
            message: `第 ${r} 行【${def?.header ?? field}】：${issue.message}`,
          })
        }
      } else {
        // 文件内账单编号重复：指向首次出现行，整体拒绝
        const invoiceNumber = String(parsed.data.invoice_number ?? "")
        const firstRow = firstSeenNumbers.get(invoiceNumber)
        if (firstRow != null) {
          rowErrors.push({
            row: r,
            message: `第 ${r} 行【账单编号】：与第 ${firstRow} 行重复，同一文件内账单编号必须唯一`,
          })
          continue
        }
        firstSeenNumbers.set(invoiceNumber, r)
        rows.push({ rowNumber: r, values: parsed.data as Record<string, unknown> })
      }
    }
  }

  if (rows.length === 0 && rowErrors.length === 0) {
    throw new ImportFormatError("文件中没有可导入的数据行")
  }

  return { rows, rowErrors, ignoredColumns }
}

export interface ImportRowPlan {
  rowNumber: number
  invoiceNumber: string
  createData: Prisma.accounting_invoicesCreateInput
  /** 更新白名单：create schema 除去 invoice_number（键）与 contract_price（仅创建可设） */
  updateData: Prisma.accounting_invoicesUpdateInput
}

/**
 * 行对象 → upsert 计划：批量校验 company 命中 companies.code，并产出 create/update 数据
 * （新旧行判定在事务内重查完成，见 route；此处不做存在性查询）
 */
export async function planAccountingInvoiceImport(
  db: Prisma.TransactionClient,
  rows: ParsedImportRow[]
): Promise<{ plans: ImportRowPlan[]; rowErrors: ImportRowError[] }> {
  const plans: ImportRowPlan[] = []
  const rowErrors: ImportRowError[] = []

  const companyCodes = [...new Set(rows.map((row) => String(row.values.company)))]
  const companyRows = await db.companies.findMany({
    where: { code: { in: companyCodes } },
    select: { code: true },
  })
  const validCompanies = new Set(companyRows.map((row) => row.code))

  for (const row of rows) {
    const company = String(row.values.company)
    if (!validCompanies.has(company)) {
      rowErrors.push({
        row: row.rowNumber,
        message: `第 ${row.rowNumber} 行【公司】：公司「${company}」不存在，请在基础管理 → 公司管理中维护`,
      })
      continue
    }
    const invoiceNumber = String(row.values.invoice_number)
    const createInput = { ...row.values }
    // 更新分支剔除键字段与合同金额（仅创建可设），其余字段全量覆盖
    const updateInput = { ...createInput }
    delete updateInput.invoice_number
    delete updateInput.contract_price
    plans.push({
      rowNumber: row.rowNumber,
      invoiceNumber,
      createData: toInvoiceCreateData(createInput),
      updateData: toInvoiceUpdateData(updateInput),
    })
  }

  return { plans, rowErrors }
}

const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FF999999" } },
  left: { style: "thin", color: { argb: "FF999999" } },
  bottom: { style: "thin", color: { argb: "FF999999" } },
  right: { style: "thin", color: { argb: "FF999999" } },
}

/** 导入模板：Sheet1 账单导入（18 列表头）+ Sheet2 填写说明 */
export async function generateAccountingInvoiceImportTemplate(): Promise<ExcelJS.Buffer> {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet("账单导入", {
    views: [{ state: "frozen", ySplit: 1 }],
  })
  sheet.columns = IMPORT_COLUMNS.map((col) => ({ width: col.width }))

  const headerRow = sheet.getRow(1)
  IMPORT_COLUMNS.forEach((col, index) => {
    const cell = headerRow.getCell(index + 1)
    cell.value = col.required ? `${col.header}*` : col.header
    cell.font = { bold: true }
    cell.alignment = { horizontal: "center", vertical: "middle" }
    cell.border = THIN_BORDER
    if (col.required) {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF2CC" } }
    }
    if (col.type === "date") sheet.getColumn(index + 1).numFmt = "yyyy-mm-dd"
    if (col.type === "money") sheet.getColumn(index + 1).numFmt = "#,##0.00"
  })
  headerRow.height = 22
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: IMPORT_COLUMNS.length },
  }

  const guideSheet = workbook.addWorksheet("填写说明")
  guideSheet.columns = [{ width: 22 }, { width: 78 }]
  const guideRows: Array<[string, string]> = [
    ["账单编号（必填）", "导入的匹配键：已存在则覆盖下方可导入字段，不存在则新增（总货号/货号由系统自动分配，无需填写）"],
    ["公司（必填）", "必须填公司代码，需先在 基础管理 → 公司管理 中维护"],
    ["覆盖规则", "文件中出现的列会覆盖对应字段，留空即清空该字段；未出现的列保持原值"],
    ["不影响的数据", "明细行、总货号/货号、合同金额（已有账单）、合同日期、Invoice 日期、支票信息、RTS、差额、备注均不受导入影响"],
    ["日期格式", "YYYY-MM-DD（如 2026-09-04），也可填 2026/9/4"],
    ["金额格式", "纯数字（如 1250.50）"],
    ["TONU", "填 是 或 否（留空视为 否）"],
    ["文件要求", "仅支持 .xlsx（.xls 请先另存为 .xlsx）；单次最多 2000 行；多余的列会被忽略"],
  ]
  const guideHeader = guideSheet.addRow(["项目", "说明"])
  guideHeader.eachCell((cell) => {
    cell.font = { bold: true }
    cell.border = THIN_BORDER
  })
  for (const [item, description] of guideRows) {
    guideSheet.addRow([item, description]).eachCell((cell) => {
      cell.alignment = { vertical: "middle", wrapText: true }
      cell.border = THIN_BORDER
    })
  }

  return workbook.xlsx.writeBuffer()
}
