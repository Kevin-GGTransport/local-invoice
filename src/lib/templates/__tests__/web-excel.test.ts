import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import { PDFDocument } from 'pdf-lib'
import { archiveExcel, excelSource, nativeToWebTemplate } from '../web-excel'
import { importNativeExcel, fillNativeExcel, nativeSourceBytes } from '../native-excel'
import { isNativeExcelGrid } from '../native-excel-types'
import { parseTemplateXlsx } from '../parse-xlsx'
import { calibrateInvoiceReference } from '../invoice-reference-layout'
import { sampleTemplateRenderData, renderTemplateData } from '../render-template-data'
import { deriveBindingFromGrid } from '../token-binding'
import { validateTemplateGrid } from '../template-grid'
import { templateGridToWorkbookData, workbookDataToTemplateGrid } from '../univer-bridge'
import { GenericTemplateDocument } from '../../services/print/generic-template-pdf'
import { webExcelToPdf } from '../../services/print/web-excel-pdf'
import type { TemplateBinding } from '../types'

async function fixture(build: (ws: ExcelJS.Worksheet, wb: ExcelJS.Workbook) => void) {
  const wb = new ExcelJS.Workbook(), ws = wb.addWorksheet('Invoice')
  build(ws, wb)
  return Buffer.from(await wb.xlsx.writeBuffer())
}

describe('Vercel web Excel templates', () => {
  it('archives byte-identical Excel without selecting native mode', async () => {
    const bytes = await fixture(ws => { ws.getCell('A1').value = 'Invoice' })
    const grid = { ...(await parseTemplateXlsx(bytes)).grid, sourceExcel: archiveExcel(bytes, 'invoice.xlsx') }
    assert.equal(isNativeExcelGrid(grid), false)
    assert.deepEqual(nativeSourceBytes({ ...grid, nativeExcel: excelSource(grid)! }), bytes)
  })

  it('reads right/bottom merged edges before ExcelJS overwrites their styles', async () => {
    const bytes = await fixture(ws => {
      ws.getCell('A1').value = 'Email'
      ws.getCell('A1').border = { top: { style: 'thin' }, left: { style: 'thin' } }
      ws.getCell('C1').border = { right: { style: 'medium' } }
      ws.getCell('B2').border = { bottom: { style: 'thin' } }
    })
    const zip = await JSZip.loadAsync(bytes)
    const sheet = await zip.file('xl/worksheets/sheet1.xml')!.async('string')
    zip.file('xl/worksheets/sheet1.xml', sheet.replace('</worksheet>', '<mergeCells count="1"><mergeCell ref="A1:C2"/></mergeCells></worksheet>'))
    const { grid } = await parseTemplateXlsx(await zip.generateAsync({ type: 'nodebuffer' }))
    const cell = grid.cells[0]
    assert.equal(cell.colSpan, 3); assert.equal(cell.rowSpan, 2)
    assert.equal(cell.style.borders?.right, 2); assert.equal(cell.style.borders?.bottom, 1)
  })

  it('ignores a large blank font-only tail while respecting explicit print bounds', async () => {
    const bytes = await fixture(ws => {
      ws.getCell('A1').value = 'Invoice'
      ws.getCell('Z80').font = { size: 10 }
      ws.pageSetup.printArea = 'A1:D10'
    })
    const parsed = await parseTemplateXlsx(bytes)
    assert.equal(parsed.grid.colWidths.length, 4); assert.equal(parsed.grid.rowHeights.length, 10)
  })

  it('rejects visible content outside web bounds rather than truncating it', async () => {
    const bytes = await fixture(ws => { ws.getCell('A1').value = 'Invoice'; ws.getCell('A81').value = 'IMPORTANT FOOTER' })
    await assert.rejects(() => webExcelToPdf(bytes), /超出范围/)
    const { grid } = await importNativeExcel(bytes, 'long.xlsx')
    await assert.rejects(() => nativeToWebTemplate(grid, { fields: {}, lineItems: null }), /超出范围/)
  })

  it('does not print stale cached formula results after filling a native input', async () => {
    const bytes = await fixture(ws => { ws.getCell('A1').value = 10; ws.getCell('B1').value = { formula: 'A1*2', result: 20 } })
    const { grid } = await importNativeExcel(bytes, 'formula.xlsx')
    const binding: TemplateBinding = { fields: { total: { cells: [{ row: 0, col: 0 }], format: 'money' } }, lineItems: null }
    const filled = await fillNativeExcel(grid, binding, { ...sampleTemplateRenderData(), total: '$50.00' })
    await assert.rejects(() => webExcelToPdf(filled), /B1.*未绑定的公式/)
    await assert.rejects(() => nativeToWebTemplate(grid, binding), /B1.*未绑定的公式/)
    binding.fields.total!.cells.push({ row: 0, col: 1 })
    const safe = await fillNativeExcel(grid, binding, { ...sampleTemplateRenderData(), total: '$50.00' })
    assert.equal((await PDFDocument.load(await webExcelToPdf(safe))).getPageCount(), 1)
  })

  it('preserves date, currency, percent and zero-padding formats, including 1904 dates', async () => {
    for (const date1904 of [false, true]) {
      const bytes = await fixture((ws, wb) => {
        wb.properties.date1904 = date1904
        ws.getCell('A1').value = new Date('2026-09-10T00:00:00Z'); ws.getCell('A1').numFmt = 'dd-mmm-yyyy'
        ws.getCell('A2').value = -1234.5; ws.getCell('A2').numFmt = '$#,##0.00;($#,##0.00)'
        ws.getCell('A3').value = 0.15; ws.getCell('A3').numFmt = '0.0%'
        ws.getCell('A4').value = 123; ws.getCell('A4').numFmt = '000000'
      })
      assert.deepEqual((await parseTemplateXlsx(bytes)).grid.cells.map(c => c.text), ['10-Sep-2026', '($1,234.50)', '15.0%', '000123'])
    }
  })

  it('converts saved bindings with non-A1 print origin without mutating the source', async () => {
    const bytes = await fixture(ws => {
      ws.pageSetup.printArea = 'B2:D8'
      ws.getCell('B2').value = 'Invoice No.'
      ws.getCell('D2').value = 'old value'
      ws.getCell('B4').value = 'old charge'; ws.getCell('D4').value = 10
      ws.getCell('B7').value = 'Total'; ws.getCell('D7').value = 10
    })
    const { grid } = await importNativeExcel(bytes, 'source.xlsx')
    const before = JSON.stringify(grid)
    const binding: TemplateBinding = { fields: { invoice_number: { cells: [{row: 1, col: 3}], format: 'text' }, total: { cells: [{row: 6, col: 3}], format: 'money' } }, lineItems: { startRow: 3, endRow: 5, minRows: 3, columns: { description: 1, amount: 3 } } }
    const result = await nativeToWebTemplate(grid, binding)
    assert.deepEqual(result.binding.fields.invoice_number?.cells, [{ row: 0, col: 2 }])
    assert.equal(result.binding.lineItems?.startRow, 2)
    assert.equal(isNativeExcelGrid(result.grid), false)
    assert.deepEqual(excelSource(result.grid), grid.nativeExcel)
    assert.equal(JSON.stringify(grid), before)
  })

  for (const preset of ['aa', 'yg'] as const) it(`${preset} reference layout retains borders through editor save and renders one page`, async () => {
    const bytes = await fixture(ws => {
      ws.getCell('B2').value = preset === 'aa' ? 'ALREADY ARRIVED LOGISTICS INC' : 'YG Trucking LLC'
      ws.getCell('E38').value = 'dispatch@ygtrucking.llc'
      ws.getCell('B43').value = 'EMAIL: Alreadyarrivedlogistics@gmail.com'
      ws.getCell('D43').value = 'THANK YOU FOR YOUR BUSINESS!'
    })
    const parsed = await parseTemplateXlsx(bytes), before = JSON.stringify(parsed)
    const tuned = calibrateInvoiceReference(parsed, preset)
    assert.equal(JSON.stringify(parsed), before)
    const snapshot = templateGridToWorkbookData(tuned.grid, tuned.pageConfig)
    assert.equal(snapshot.sheets[snapshot.sheetOrder[0]].showGridlines, 0)
    const saved = workbookDataToTemplateGrid(snapshot, tuned.pageConfig)
    const binding = deriveBindingFromGrid(saved)
    assert.deepEqual(binding.errors, []); assert.deepEqual(validateTemplateGrid(saved, binding.binding), [])
    assert.equal(binding.binding.lineItems?.minRows, preset === 'aa' ? 14 : 15)
    if (preset === 'yg') assert.equal(saved.cells.find(c => c.text === 'dispatch@ygtrucking.llc')?.style.borders?.right, 1)
    const rendered = renderTemplateData(saved, binding.binding, sampleTemplateRenderData())
    // Same component shape used by production; react-pdf's public typing expects
    // the root Document props rather than a wrapper component's props.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const document: React.ReactElement<any> = React.createElement(GenericTemplateDocument, { pageConfig: tuned.pageConfig, grid: rendered })
    const pdf = await renderToBuffer(document)
    assert.equal((await PDFDocument.load(pdf)).getPageCount(), 1)
    await assert.rejects(async () => calibrateInvoiceReference(parsed, preset === 'aa' ? 'yg' : 'aa'), /公司.*不匹配/)
  })
})
