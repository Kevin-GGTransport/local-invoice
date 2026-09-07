import assert from "node:assert/strict"
import test from "node:test"
import ExcelJS from "exceljs"
import {
  IMPORT_COLUMNS,
  ImportFormatError,
  generateAccountingInvoiceImportTemplate,
  parseAccountingInvoiceImportWorkbook,
} from "../accounting-invoice-import"

const STANDARD_HEADERS = IMPORT_COLUMNS.map((col) => col.header)

/** 按模板列序生成一条标准数据行（字段 → 单元格值，未给出的字段为 null） */
function standardRow(overrides: Record<string, unknown>): unknown[] {
  return IMPORT_COLUMNS.map((col) =>
    col.field in overrides ? overrides[col.field] : null
  )
}

async function writeWorkbook(rows: Array<Array<unknown>>): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet("Sheet1")
  for (const row of rows) {
    sheet.addRow(row)
    // exceljs 读取时按 numFmt 判定日期单元格，写入 Date 后显式补格式保证读回为 Date
    row.forEach((value, index) => {
      if (value instanceof Date) sheet.getRow(sheet.rowCount).getCell(index + 1).numFmt = "yyyy-mm-dd"
    })
  }
  return Buffer.from(await workbook.xlsx.writeBuffer())
}

test("标准 18 列模板文件解析：2 行数据，字段转换正确", async () => {
  const buffer = await writeWorkbook([
    STANDARD_HEADERS,
    standardRow({
      invoice_number: "INV-001",
      company: "GNG",
      contract_price: "1250.50",
      bill_to: "Acme Broker",
      broker_load_number: "L-100",
      billing_category: "Linehaul",
      tonu: "是",
      deduction: "RTS -50",
      invoice_price: "980",
      quantity: "2",
      unit_price: "490",
      description: "desc",
      pickup_date: "2026-09-01",
      pickup_company: "Shipper A",
      pickup_address: "Addr A",
      drop_date: "2026/9/2",
      drop_company: "Consignee B",
      drop_address: "Addr B",
    }),
    standardRow({ invoice_number: "INV-002", company: "YG", tonu: "否" }),
  ])

  const parsed = await parseAccountingInvoiceImportWorkbook(buffer)
  assert.equal(parsed.rows.length, 2)
  assert.equal(parsed.rowErrors.length, 0)
  assert.equal(parsed.ignoredColumns.length, 0)

  const first = parsed.rows[0].values
  assert.equal(first.invoice_number, "INV-001")
  assert.equal(first.company, "GNG")
  assert.equal(first.contract_price, 1250.5)
  assert.equal(first.tonu, true)
  assert.equal(first.invoice_price, 980)
  assert.equal(first.quantity, 2)
  assert.equal(first.pickup_date, "2026-09-01")
  assert.equal(first.drop_date, "2026-09-02")

  const second = parsed.rows[1].values
  assert.equal(second.tonu, false)
  assert.equal(second.contract_price, null)
  assert.equal(second.bill_to, "")
})

test("日期单元格：Date 对象按 UTC 归一，字符串支持 YYYY/M/D，非法值报行级错误", async () => {
  const buffer = await writeWorkbook([
    STANDARD_HEADERS,
    standardRow({ invoice_number: "INV-D1", company: "GNG", pickup_date: new Date(Date.UTC(2026, 8, 4)) }),
    standardRow({ invoice_number: "INV-D2", company: "GNG", pickup_date: "2026/9/4" }),
    standardRow({ invoice_number: "INV-D3", company: "GNG", pickup_date: "abc" }),
    standardRow({ invoice_number: "INV-D4", company: "GNG", pickup_date: "2026-02-30" }),
  ])

  const parsed = await parseAccountingInvoiceImportWorkbook(buffer)
  assert.equal(parsed.rows.length, 2)
  assert.equal(parsed.rows[0].values.pickup_date, "2026-09-04")
  assert.equal(parsed.rows[1].values.pickup_date, "2026-09-04")
  assert.equal(parsed.rowErrors.length, 2)
  assert.match(parsed.rowErrors[0].message, /日期格式应为 YYYY-MM-DD/)
  assert.match(parsed.rowErrors[1].message, /日期不存在/)
})

test("TONU：是/否/TRUE/0/空 → 布尔，非法值报行级错误", async () => {
  const buffer = await writeWorkbook([
    STANDARD_HEADERS,
    standardRow({ invoice_number: "INV-T1", company: "GNG", tonu: "是" }),
    standardRow({ invoice_number: "INV-T2", company: "GNG", tonu: "否" }),
    standardRow({ invoice_number: "INV-T3", company: "GNG", tonu: "TRUE" }),
    standardRow({ invoice_number: "INV-T4", company: "GNG", tonu: 0 }),
    standardRow({ invoice_number: "INV-T5", company: "GNG", tonu: null }),
    standardRow({ invoice_number: "INV-T6", company: "GNG", tonu: "x" }),
  ])

  const parsed = await parseAccountingInvoiceImportWorkbook(buffer)
  assert.equal(parsed.rows.length, 5)
  assert.deepEqual(
    parsed.rows.map((row) => row.values.tonu),
    [true, false, true, false, false]
  )
  assert.equal(parsed.rowErrors.length, 1)
  assert.match(parsed.rowErrors[0].message, /TONU 只能填 是 或 否/)
})

test("金额：数字与数字字符串均可，空为 null，非数字报 zod 行级错误", async () => {
  const buffer = await writeWorkbook([
    STANDARD_HEADERS,
    standardRow({ invoice_number: "INV-M1", company: "GNG", invoice_price: 1250.5 }),
    standardRow({ invoice_number: "INV-M2", company: "GNG", invoice_price: "1250.50" }),
    standardRow({ invoice_number: "INV-M3", company: "GNG", invoice_price: "abc" }),
  ])

  const parsed = await parseAccountingInvoiceImportWorkbook(buffer)
  assert.equal(parsed.rows.length, 2)
  assert.equal(parsed.rows[0].values.invoice_price, 1250.5)
  assert.equal(parsed.rows[1].values.invoice_price, 1250.5)
  assert.equal(parsed.rowErrors.length, 1)
  assert.match(parsed.rowErrors[0].message, /【Invoice 价格】/)
})

test("缺少必填表头（账单编号）→ 文件级错误并列出缺失列", async () => {
  const headers = STANDARD_HEADERS.filter((header) => header !== "账单编号")
  const buffer = await writeWorkbook([headers, ["GNG"]])

  await assert.rejects(
    () => parseAccountingInvoiceImportWorkbook(buffer),
    (err: unknown) => {
      assert.ok(err instanceof ImportFormatError)
      assert.match(err.message, /缺少必填列：账单编号/)
      return true
    }
  )
})

test("导出文件回导：表头在第 3 行 + 别名表头可识别，多余列进 ignoredColumns", async () => {
  const exportHeaders = [
    "总货号", "公司", "货号", "合同日期", "合同金额", "Broker公司", "Load #", "账单分类",
    "Invoice Number", "Invoice 日期", "Invoice 价格", "支票日期", "支票金额", "支票号",
    "扣", "RTS", "差额", "备注",
  ]
  const buffer = await writeWorkbook([
    ["Accouting 清单"],
    ["货号", null, null, "合同", null, "Broker", null, null, "Invoice", null, null, "支票", null, "会计", null, null, "备注", null],
    exportHeaders,
    ["1", "GNG", "2", "2026-09-01", "100", "Acme", "L-1", "Linehaul", "INV-009", "2026-09-02", "980", "", "", "", "RTS -50", "", "", ""],
  ])

  const parsed = await parseAccountingInvoiceImportWorkbook(buffer)
  assert.equal(parsed.rows.length, 1)
  assert.equal(parsed.rowErrors.length, 0)
  const values = parsed.rows[0].values
  assert.equal(values.invoice_number, "INV-009")
  assert.equal(values.company, "GNG")
  assert.equal(values.contract_price, 100)
  assert.equal(values.invoice_price, 980)
  assert.equal(values.deduction, "RTS -50")
  assert.equal("pickup_date" in values, false)
  for (const ignored of ["总货号", "货号", "合同日期", "Invoice 日期", "支票号", "RTS", "差额", "备注"]) {
    assert.ok(parsed.ignoredColumns.includes(ignored), `应忽略列：${ignored}`)
  }
})

test("文件内账单编号重复：指向首次出现行，重复行不计入 rows", async () => {
  const buffer = await writeWorkbook([
    STANDARD_HEADERS,
    standardRow({ invoice_number: "INV-SAME", company: "GNG", description: "first" }),
    standardRow({ invoice_number: "INV-SAME", company: "GNG", description: "second" }),
  ])

  const parsed = await parseAccountingInvoiceImportWorkbook(buffer)
  assert.equal(parsed.rows.length, 1)
  assert.equal(parsed.rowErrors.length, 1)
  assert.equal(parsed.rowErrors[0].row, 3)
  assert.match(parsed.rowErrors[0].message, /与第 2 行重复/)
})

test("中间空行（含纯空格）跳过；只有表头 → 文件级错误", async () => {
  const withBlank = await writeWorkbook([
    STANDARD_HEADERS,
    standardRow({ invoice_number: "INV-B1", company: "GNG" }),
    new Array(IMPORT_COLUMNS.length).fill(null),
    // 纯空格行对用户不可见，同样应跳过而非报"发票号不能为空"
    new Array(IMPORT_COLUMNS.length).fill("  "),
    standardRow({ invoice_number: "INV-B2", company: "GNG" }),
  ])
  const parsed = await parseAccountingInvoiceImportWorkbook(withBlank)
  assert.equal(parsed.rows.length, 2)
  assert.equal(parsed.rowErrors.length, 0)

  const headerOnly = await writeWorkbook([STANDARD_HEADERS])
  await assert.rejects(
    () => parseAccountingInvoiceImportWorkbook(headerOnly),
    (err: unknown) => {
      assert.ok(err instanceof ImportFormatError)
      assert.match(err.message, /没有可导入的数据行/)
      return true
    }
  )
})

test("必填值缺失：空账单编号/空公司 → 带中文列名的行级错误", async () => {
  const buffer = await writeWorkbook([
    STANDARD_HEADERS,
    // 行内需有非空单元格，否则会被当作全空行跳过
    standardRow({ invoice_number: null, company: null, description: "keep row visible" }),
  ])

  const parsed = await parseAccountingInvoiceImportWorkbook(buffer)
  assert.equal(parsed.rows.length, 0)
  const messages = parsed.rowErrors.map((err) => err.message).join("\n")
  assert.match(messages, /【账单编号】/)
  assert.match(messages, /【公司】/)
})

test("模板自洽：生成的模板追加一行数据后可被解析（表头含 * 标记）", async () => {
  const templateBuffer = await generateAccountingInvoiceImportTemplate()
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(templateBuffer)
  const sheet = workbook.getWorksheet("账单导入")
  assert.ok(sheet)
  sheet.addRow(
    IMPORT_COLUMNS.map((col) => {
      const preset: Record<string, unknown> = {
        invoice_number: "INV-RT-1",
        company: "GNG",
        contract_price: 100,
        tonu: "是",
        pickup_date: "2026-09-04",
      }
      return preset[col.field] ?? null
    })
  )
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer())

  const parsed = await parseAccountingInvoiceImportWorkbook(buffer)
  assert.equal(parsed.rowErrors.length, 0)
  assert.equal(parsed.ignoredColumns.length, 0)
  assert.equal(parsed.rows.length, 1)
  assert.equal(parsed.rows[0].values.invoice_number, "INV-RT-1")
  assert.equal(parsed.rows[0].values.contract_price, 100)
  assert.equal(parsed.rows[0].values.pickup_date, "2026-09-04")
})
