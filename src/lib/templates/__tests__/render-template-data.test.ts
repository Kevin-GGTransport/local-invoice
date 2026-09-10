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

  it('明细数 ≤ 区域容量：逐行填值，区域原行高与样式保留，下方内容零移动（回归：不补空、不下移）', () => {
    const g = grid(6, 3)
    g.colWidths = [100, 100, 100] // 描述列足够宽，值单行放下（避免 autoFit 撑高干扰断言）
    g.rowHeights = [30, 18, 16, 16, 20, 22]
    g.cells = [
      { row: 0, col: 0, rowSpan: 1, colSpan: 1, text: 'header', style: {} },
      { row: 1, col: 0, rowSpan: 1, colSpan: 1, text: '{{描述}}', style: { fill: '#EEEEEE' } },
      { row: 1, col: 1, rowSpan: 1, colSpan: 1, text: '{{金额}}', style: {} },
      { row: 2, col: 0, rowSpan: 1, colSpan: 1, text: '', style: { fill: '#DDDDDD' } },
      { row: 2, col: 1, rowSpan: 1, colSpan: 1, text: '', style: {} },
      { row: 3, col: 0, rowSpan: 1, colSpan: 1, text: '', style: {} }, // 区域末行（容量 3）
      { row: 5, col: 0, rowSpan: 1, colSpan: 1, text: 'TOTAL', style: {} },
    ]
    const binding: TemplateBinding = {
      fields: { total: { cells: [{ row: 5, col: 0 }], format: 'money' } },
      lineItems: {
        startRow: 1,
        endRow: 3,
        columns: { description: 0, amount: 1 },
        minRows: 3,
      },
    }
    const data = sampleTemplateRenderData()
    const out = renderTemplateData(g, binding, data)
    // 总行数与各行高完全不变 —— 模板是什么，输出就是什么
    assert.deepEqual(out.rowHeights, [30, 18, 16, 16, 20, 22])
    // 两条明细分别落在区域内前两行
    assert.equal(out.cells.find((c) => c.row === 1 && c.col === 0)?.text, 'Carrier Charge')
    assert.equal(out.cells.find((c) => c.row === 1 && c.col === 1)?.text, '$925.00')
    assert.equal(out.cells.find((c) => c.row === 2 && c.col === 0)?.text, 'Lumper Fee')
    assert.equal(out.cells.find((c) => c.row === 2 && c.col === 1)?.text, '$200.00')
    // 容量内剩余行保持空、保留自身样式
    const rest = out.cells.find((c) => c.row === 3 && c.col === 0)
    assert.equal(rest?.text, '')
    assert.equal(out.cells.find((c) => c.row === 2 && c.col === 0)?.style.fill, '#DDDDDD')
    // 值格强制 wrap；令牌行样式保留
    assert.equal(out.cells.find((c) => c.row === 1 && c.col === 0)?.style.wrap, true)
    assert.equal(out.cells.find((c) => c.row === 1 && c.col === 0)?.style.fill, '#EEEEEE')
    // TOTAL 仍在原行原位，值替换为金额
    assert.equal(out.cells.find((c) => c.text === '$1,125.00')?.row, 5)
  })

  it('区域内某行缺失明细列单元格时，从令牌行克隆补齐', () => {
    const g = grid(4, 2)
    g.cells = [
      { row: 1, col: 0, rowSpan: 1, colSpan: 1, text: '{{描述}}', style: { bold: true } },
      { row: 1, col: 1, rowSpan: 1, colSpan: 1, text: '{{金额}}', style: {} },
      // 第 2 行没有任何单元格（稀疏行，属于区域容量）
      { row: 3, col: 0, rowSpan: 1, colSpan: 1, text: 'END', style: {} },
    ]
    const binding: TemplateBinding = {
      fields: {},
      lineItems: { startRow: 1, endRow: 2, columns: { description: 0, amount: 1 }, minRows: 2 },
    }
    const out = renderTemplateData(g, binding, {
      ...sampleTemplateRenderData(),
      lines: [
        { description: 'A', quantity: '1', unitPrice: '$1.00', amount: '$1.00' },
        { description: 'B', quantity: '1', unitPrice: '$2.00', amount: '$2.00' },
      ],
    })
    const cloned = out.cells.find((c) => c.row === 2 && c.col === 0)
    assert.equal(cloned?.text, 'B')
    assert.equal(cloned?.style.bold, true) // 克隆令牌行样式
    assert.equal(out.cells.find((c) => c.row === 2 && c.col === 1)?.text, '$2.00')
    assert.equal(out.rowHeights.length, 4) // 容量内零增长
  })

  it('明细行超出容量自动扩展：增长行克隆令牌行，rowSpan 钳为 1，下方下移', () => {
    const g = grid(5, 2)
    g.rowHeights = [30, 16, 16, 12, 20]
    g.cells = [
      { row: 0, col: 0, rowSpan: 1, colSpan: 1, text: 'H', style: {} },
      // 令牌行：描述格纵向合并 2 行 + 静态装饰格
      { row: 1, col: 0, rowSpan: 2, colSpan: 1, text: '{{描述}}', style: { bold: true } },
      { row: 1, col: 1, rowSpan: 1, colSpan: 1, text: '{{金额}}', style: {} },
      { row: 2, col: 1, rowSpan: 1, colSpan: 1, text: '', style: {} }, // 容量 2
      { row: 4, col: 0, rowSpan: 1, colSpan: 1, text: 'TOTAL', style: {} },
    ]
    const binding: TemplateBinding = {
      fields: {},
      lineItems: { startRow: 1, endRow: 2, columns: { description: 0, amount: 1 }, minRows: 2 },
    }
    const data = {
      ...sampleTemplateRenderData(),
      lines: Array.from({ length: 4 }, (_, i) => ({
        description: `L${i}`,
        quantity: '1',
        unitPrice: '$1.00',
        amount: `$${i + 1}.00`,
      })),
    }
    const out = renderTemplateData(g, binding, data)
    // 1 表头 + 4 明细 + 区域后 2 行 = 7
    assert.equal(out.rowHeights.length, 7)
    // 增长行行高取令牌行（16）
    assert.equal(out.rowHeights[3], 16)
    assert.equal(out.rowHeights[4], 16)
    // 区域内原行高保留
    assert.equal(out.rowHeights[1], 16)
    assert.equal(out.rowHeights[2], 16)
    // 4 条明细各自一行
    for (let i = 0; i < 4; i++) {
      assert.equal(out.cells.find((c) => c.row === 1 + i && c.col === 0)?.text, `L${i}`)
    }
    // 增长行的克隆格 rowSpan 钳为 1（避免纵向合并越界重叠）
    assert.equal(out.cells.find((c) => c.row === 2 && c.col === 0)?.rowSpan, 1)
    assert.equal(out.cells.find((c) => c.row === 3 && c.col === 0)?.rowSpan, 1)
    // 克隆保留令牌行样式
    assert.equal(out.cells.find((c) => c.row === 3 && c.col === 0)?.style.bold, true)
    // 区域下方内容整体下移 2 行（4 - 2 容量差）
    assert.equal(out.cells.find((c) => c.text === 'TOTAL')?.row, 6)
    assert.equal(out.rowHeights[6], 20)
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

  it('绑定格含令牌时只替换令牌、保留静态文本，并强制 wrap', () => {
    const g = grid(2, 2)
    g.cells = [{ row: 0, col: 0, rowSpan: 1, colSpan: 1, text: 'Invoice No: {{发票号}}', style: {} }]
    const binding: TemplateBinding = {
      fields: { invoice_number: { cells: [{ row: 0, col: 0 }], format: 'text' } },
      lineItems: null,
    }
    const out = renderTemplateData(g, binding, sampleTemplateRenderData())
    const target = out.cells.find((c) => c.row === 0 && c.col === 0)!
    assert.equal(target.text, 'Invoice No: AA082026001')
    assert.equal(target.style.wrap, true)
  })

  it('绑定格不含令牌（旧数据）时整格替换，行为与旧版一致', () => {
    const g = grid(2, 2)
    g.cells = [{ row: 0, col: 0, rowSpan: 1, colSpan: 1, text: '旧占位文本', style: {} }]
    const binding: TemplateBinding = {
      fields: { invoice_number: { cells: [{ row: 0, col: 0 }], format: 'text' } },
      lineItems: null,
    }
    const out = renderTemplateData(g, binding, sampleTemplateRenderData())
    const target = out.cells.find((c) => c.row === 0 && c.col === 0)!
    assert.equal(target.text, 'AA082026001')
    assert.equal(target.style.wrap, true)
  })

  it('明细模板行令牌格生成的数据行也强制 wrap', () => {
    const g = grid(3, 2)
    g.cells = [
      { row: 1, col: 0, rowSpan: 1, colSpan: 1, text: '{{描述}}', style: {} },
      { row: 1, col: 1, rowSpan: 1, colSpan: 1, text: '{{金额}}', style: {} },
    ]
    const binding: TemplateBinding = {
      fields: {},
      lineItems: { startRow: 1, endRow: 1, columns: { description: 0, amount: 1 }, minRows: 2 },
    }
    const out = renderTemplateData(g, binding, sampleTemplateRenderData())
    const desc = out.cells.find((c) => c.row === 1 && c.col === 0)!
    assert.equal(desc.text, 'Carrier Charge')
    assert.equal(desc.style.wrap, true)
  })
})
