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
      a1.font = { name: 'Arial', bold: true, size: 14, color: { argb: 'FF1C4587' } }
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
    assert.equal(title.style.fontFamily, 'Arial')
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

  it('保留 Excel 纸张方向和页边距', async () => {
    const buf = await workbookBuffer((ws) => {
      ws.getCell('A1').value = 'Landscape invoice'
      ws.pageSetup.paperSize = 1 as ExcelJS.PaperSize
      ws.pageSetup.orientation = 'landscape'
      ws.pageSetup.margins = {
        left: 0.25,
        right: 0.5,
        top: 0.75,
        bottom: 1,
        header: 0.2,
        footer: 0.2,
      }
    })
    const { pageConfig } = await parseTemplateXlsx(buf)
    assert.equal(pageConfig.size, 'LETTER')
    assert.equal(pageConfig.orientation, 'landscape')
    assert.deepEqual(pageConfig.margin, { left: 18, right: 36, top: 54, bottom: 72 })
  })

  it('按 Excel 打印区域保留尾部空白版式', async () => {
    const buf = await workbookBuffer((ws) => {
      ws.getCell('A1').value = 'Invoice'
      ws.pageSetup.printArea = 'A1:D8'
    })
    const { grid } = await parseTemplateXlsx(buf)
    assert.equal(grid.colWidths.length, 4)
    assert.equal(grid.rowHeights.length, 8)
  })

  it('空文件被拒绝，中文样张可正常解析', async () => {
    const empty = await workbookBuffer(() => {})
    await assert.rejects(() => parseTemplateXlsx(empty), /内容为空/)
    const cjk = await workbookBuffer((ws) => {
      ws.getCell('A1').value = '中文标题'
    })
    const parsed = await parseTemplateXlsx(cjk)
    assert.equal(parsed.grid.cells[0]?.text, '中文标题')
    assert.equal(parsed.pageConfig.fontFamily, 'Noto Sans SC')
  })

  it('导入下划线、删除线与边框线型', async () => {
    const buf = await workbookBuffer((ws) => {
      const c = ws.getCell(1, 1)
      c.value = 'x'
      c.font = { underline: true, strike: true }
      c.border = { top: { style: 'double' }, bottom: { style: 'dashed' } }
    })
    const { grid } = await parseTemplateXlsx(buf)
    const cell = grid.cells[0]
    assert.equal(cell.style.underline, true)
    assert.equal(cell.style.strike, true)
    assert.equal(cell.style.borders?.styles?.top, 'double')
    assert.equal(cell.style.borders?.styles?.bottom, 'dashed')
    assert.equal(cell.style.borders?.top, 2.5)
  })

  it('将 Excel 主题色、tint 和半透明 ARGB 固化为不透明 sRGB', async () => {
    const buf = await workbookBuffer((ws) => {
      ws.getCell('A1').value = 'theme'
      ws.getCell('A1').fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { theme: 4, tint: 0.5 } as unknown as ExcelJS.Color,
      }
      ws.getCell('A1').font = { color: { argb: '80000000' } }
    })
    const { grid } = await parseTemplateXlsx(buf)
    assert.equal(grid.cells[0].style.fill, '#A7C0DE')
    assert.equal(grid.cells[0].style.color, '#000000')
  })

  it('保留仅出现在左右边的彩色边框', async () => {
    const buf = await workbookBuffer((ws) => {
      ws.getCell('A1').value = 'border'
      ws.getCell('A1').border = { right: { style: 'thin', color: { argb: 'FFF49B33' } } }
    })
    const { grid } = await parseTemplateXlsx(buf)
    assert.equal(grid.cells[0].style.borders?.color, '#F49B33')
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
