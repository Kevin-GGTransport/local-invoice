import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import ExcelJS from 'exceljs'
import { parseTemplateXlsx } from '../parse-xlsx'
import { validateBindingForPublish, type TemplateBinding } from '../types'

async function workbookBuffer(build: (ws: ExcelJS.Worksheet) => void): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Invoice')
  build(ws)
  return Buffer.from(await wb.xlsx.writeBuffer())
}

describe('parseTemplateXlsx', () => {
  it('解析合并单元格、样式、列宽与文本', async () => {
    const buf = await workbookBuffer((ws) => {
      ws.getColumn(1).width = 10
      ws.getColumn(2).width = 20
      ws.getRow(1).height = 30
      ws.mergeCells('A1:B1')
      const a1 = ws.getCell('A1')
      a1.value = 'TITLE'
      a1.font = { bold: true, size: 14, color: { argb: 'FF1C4587' } }
      a1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF49B33' } }
      a1.alignment = { horizontal: 'center', vertical: 'middle' }
      ws.getCell('A2').value = 'cell'
      ws.getCell('A2').border = {
        top: { style: 'medium' },
        bottom: { style: 'thin' },
      }
    })
    const { grid } = await parseTemplateXlsx(buf)
    const title = grid.cells.find((c) => c.text === 'TITLE')
    assert.ok(title)
    assert.equal(title.colSpan, 2)
    assert.equal(title.style.bold, true)
    assert.equal(title.style.fontSize, 14)
    assert.equal(title.style.color, '#1C4587')
    assert.equal(title.style.fill, '#F49B33')
    assert.equal(title.style.halign, 'center')
    const bordered = grid.cells.find((c) => c.text === 'cell')
    assert.ok(bordered?.style.borders)
    assert.equal(bordered.style.borders?.top, 2)
    assert.equal(bordered.style.borders?.bottom, 1)
    assert.equal(grid.rowHeights[0], 30)
    assert.ok(grid.colWidths[1] > grid.colWidths[0])
  })

  it('空文件与中文样张被拒绝', async () => {
    const empty = await workbookBuffer(() => {})
    await assert.rejects(() => parseTemplateXlsx(empty), /内容为空/)
    const cjk = await workbookBuffer((ws) => {
      ws.getCell('A1').value = '中文标题'
    })
    await assert.rejects(() => parseTemplateXlsx(cjk), /中文/)
  })
})

describe('validateBindingForPublish', () => {
  it('缺少明细区域 / 必填列 / 列重复时给出错误', () => {
    const noLineItems: TemplateBinding = { fields: {}, lineItems: null }
    assert.ok(validateBindingForPublish(noLineItems).length > 0)

    const missingAmount = {
      fields: {},
      lineItems: { startRow: 2, endRow: 4, columns: { description: 0 }, minRows: 5 },
    } as unknown as TemplateBinding
    assert.ok(validateBindingForPublish(missingAmount).some((e) => e.includes('Amount')))

    const dupCols: TemplateBinding = {
      fields: {},
      lineItems: {
        startRow: 2,
        endRow: 4,
        columns: { description: 0, quantity: 0, amount: 1 },
        minRows: 5,
      },
    }
    assert.ok(validateBindingForPublish(dupCols).some((e) => e.includes('重复')))

    const valid: TemplateBinding = {
      fields: {},
      lineItems: { startRow: 2, endRow: 4, columns: { description: 0, amount: 1 }, minRows: 5 },
    }
    assert.equal(validateBindingForPublish(valid).length, 0)
  })
})
