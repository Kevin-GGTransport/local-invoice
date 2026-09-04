import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { renderTemplateData, sampleTemplateRenderData } from '../render-template-data'
import type { TemplateBinding, TemplateGrid } from '../types'

function grid(rows: number, cols: number): TemplateGrid {
  return {
    colWidths: Array.from({ length: cols }, () => 50),
    rowHeights: Array.from({ length: rows }, () => 20),
    cells: [],
  }
}

describe('renderTemplateData', () => {
  it('简单字段绑定替换文本（支持同字段多单元格）', () => {
    const g = grid(3, 3)
    g.cells = [
      { row: 0, col: 0, rowSpan: 1, colSpan: 1, text: 'label', style: {} },
      { row: 1, col: 1, rowSpan: 1, colSpan: 1, text: '', style: {} },
      { row: 2, col: 2, rowSpan: 1, colSpan: 1, text: '', style: {} },
    ]
    const binding: TemplateBinding = {
      fields: {
        invoice_number: { cells: [{ row: 1, col: 1 }, { row: 2, col: 2 }], format: 'text' },
      },
      lineItems: null,
    }
    const out = renderTemplateData(g, binding, sampleTemplateRenderData())
    assert.equal(out.cells.find((c) => c.row === 1 && c.col === 1)?.text, 'AA082026001')
    assert.equal(out.cells.find((c) => c.row === 2 && c.col === 2)?.text, 'AA082026001')
    assert.equal(out.cells.find((c) => c.row === 0 && c.col === 0)?.text, 'label')
  })

  it('明细行不足 minRows 补空行，区域后单元格整体下移', () => {
    const g = grid(6, 3)
    g.cells = [
      { row: 0, col: 0, rowSpan: 1, colSpan: 1, text: 'header', style: {} },
      { row: 1, col: 0, rowSpan: 1, colSpan: 1, text: 'desc', style: {} },
      { row: 1, col: 1, rowSpan: 1, colSpan: 1, text: '', style: {} },
      { row: 2, col: 0, rowSpan: 1, colSpan: 1, text: '', style: {} },
      { row: 2, col: 1, rowSpan: 1, colSpan: 1, text: '', style: {} },
      { row: 3, col: 0, rowSpan: 1, colSpan: 1, text: '', style: {} }, // 占位区域末行
      { row: 5, col: 0, rowSpan: 1, colSpan: 1, text: 'TOTAL', style: {} },
    ]
    const binding: TemplateBinding = {
      fields: { total: { cells: [{ row: 5, col: 0 }], format: 'money' } },
      lineItems: {
        startRow: 1,
        endRow: 3,
        columns: { description: 0, amount: 1 },
        minRows: 6,
      },
    }
    const data = sampleTemplateRenderData()
    const out = renderTemplateData(g, binding, data)
    // 6 行明细（2 数据 + 4 空行），原 3 行区域 → 后移 3 行：1 + 6 + 2 = 9 行
    assert.equal(out.rowHeights.length, 9)
    // TOTAL 单元格被 total 字段绑定替换为金额，位置后移 3 行
    assert.equal(out.cells.find((c) => c.text === '$1,125.00')?.row, 8)
    // 数据行
    const row1desc = out.cells.find((c) => c.row === 1 && c.col === 0)
    const row1amount = out.cells.find((c) => c.row === 1 && c.col === 1)
    assert.equal(row1desc?.text, 'Carrier Charge')
    assert.equal(row1amount?.text, '$925.00')
    // 空行存在且文本为空
    const blank = out.cells.filter((c) => c.row === 5 && c.col === 0)
    assert.equal(blank.length, 1)
    assert.equal(blank[0].text, '')
  })

  it('明细行超出 minRows 自动扩展', () => {
    const g = grid(4, 2)
    g.cells = [
      { row: 0, col: 0, rowSpan: 1, colSpan: 1, text: 'H', style: {} },
      { row: 1, col: 0, rowSpan: 1, colSpan: 1, text: '', style: {} },
      { row: 1, col: 1, rowSpan: 1, colSpan: 1, text: '', style: {} },
    ]
    const binding: TemplateBinding = {
      fields: {},
      lineItems: { startRow: 1, endRow: 1, columns: { description: 0, amount: 1 }, minRows: 2 },
    }
    const data = {
      ...sampleTemplateRenderData(),
      lines: Array.from({ length: 5 }, (_, i) => ({
        description: `L${i}`,
        quantity: '1',
        unitPrice: '$1.00',
        amount: '$1.00',
      })),
    }
    const out = renderTemplateData(g, binding, data)
    assert.equal(out.cells.filter((c) => c.row === 5 && c.col === 0)[0].text, 'L4')
    // 1 行表头 + 5 行明细 + 区域后 2 行 = 8
    assert.equal(out.rowHeights.length, 8)
  })

  it('无绑定时原样返回网格', () => {
    const g = grid(2, 2)
    g.cells = [{ row: 0, col: 0, rowSpan: 1, colSpan: 1, text: 'x', style: {} }]
    const out = renderTemplateData(g, null, sampleTemplateRenderData())
    assert.equal(out.cells.length, 1)
  })

  it('未绑定明细列时不会默认把数据写入第一列', () => {
    const g = grid(3, 2)
    g.cells = [
      { row: 1, col: 0, rowSpan: 1, colSpan: 1, text: 'placeholder', style: {} },
      { row: 1, col: 1, rowSpan: 1, colSpan: 1, text: '', style: {} },
    ]
    const binding: TemplateBinding = {
      fields: {},
      lineItems: { startRow: 1, endRow: 1, columns: {}, minRows: 1 },
    }
    const out = renderTemplateData(g, binding, sampleTemplateRenderData())
    assert.equal(out.cells.find((c) => c.row === 1 && c.col === 0)?.text, 'placeholder')
    assert.equal(out.cells.find((c) => c.row === 1 && c.col === 1)?.text, '')
  })
})
