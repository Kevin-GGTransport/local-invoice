import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { templateGridToWorkbookData, workbookDataToTemplateGrid } from '../univer-bridge'
import type { TemplateGrid, TemplatePageConfig } from '../types'

const pageConfig: TemplatePageConfig = {
  size: 'A4',
  margin: { top: 24, right: 24, bottom: 24, left: 24 },
  fontFamily: 'Noto Sans SC',
  baseFontSize: 10,
  textColor: '#000000',
}

describe('univer-bridge round-trip', () => {
  it('文本/样式/合并/尺寸往返等价（模型支持子集）', () => {
    const grid: TemplateGrid = {
      colWidths: [48, 60, 72],
      rowHeights: [15, 20, 24],
      cells: [
        { row: 0, col: 0, rowSpan: 1, colSpan: 2, text: '标题', style: { bold: true, fontSize: 14, underline: true } },
        { row: 1, col: 2, rowSpan: 2, colSpan: 1, text: '{{发票号}}', style: { italic: true, strike: true, color: '#FF0000', fill: '#FFFF00', halign: 'center', valign: 'middle', wrap: true } },
        { row: 2, col: 0, rowSpan: 1, colSpan: 1, text: '带框', style: { borders: { top: 1, right: 2, bottom: 0.5, left: 2.5, color: '#333333', styles: { bottom: 'dashed', left: 'double' } } } },
      ],
    }
    const workbook = templateGridToWorkbookData(grid, pageConfig)
    const back = workbookDataToTemplateGrid(workbook, pageConfig)
    assert.deepEqual(back, grid)
  })

  it('空文本但有样式的格保留', () => {
    const grid: TemplateGrid = {
      colWidths: [48],
      rowHeights: [15],
      cells: [{ row: 0, col: 0, rowSpan: 1, colSpan: 1, text: '', style: { fill: '#EEEEEE' } }],
    }
    const back = workbookDataToTemplateGrid(templateGridToWorkbookData(grid, pageConfig), pageConfig)
    assert.deepEqual(back, grid)
  })

  it('公式格取显示值（v），不保留公式', () => {
    const workbook = templateGridToWorkbookData(
      { colWidths: [48], rowHeights: [15], cells: [{ row: 0, col: 0, rowSpan: 1, colSpan: 1, text: '', style: {} }] },
      pageConfig
    )
    const sheet = workbook.sheets[workbook.sheetOrder[0]]
    sheet.cellData[0] = { 0: { v: 42, f: '=SUM(1,41)' } }
    const back = workbookDataToTemplateGrid(workbook, pageConfig)
    assert.equal(back.cells.find((c) => c.row === 0 && c.col === 0)?.text, '42')
    assert.ok(!back.cells[0].text.includes('='))
  })

  it('真实快照扩展线型归一化（hair → dashed 0.5pt，不丢弃）', () => {
    const workbook = templateGridToWorkbookData(
      { colWidths: [48], rowHeights: [15], cells: [{ row: 0, col: 0, rowSpan: 1, colSpan: 1, text: 'x', style: {} }] },
      pageConfig
    )
    const sheet = workbook.sheets[workbook.sheetOrder[0]]
    sheet.cellData[0] = { 0: { v: 'x', s: { bd: { top: { style: 'hair' }, bottom: { style: 'mediumDashed' } } } } }
    const back = workbookDataToTemplateGrid(workbook, pageConfig)
    const borders = back.cells[0].style.borders
    assert.equal(borders?.top, 0.5)
    assert.equal(borders?.styles?.top, 'dashed')
    assert.equal(borders?.bottom, 0.5)
    assert.equal(borders?.styles?.bottom, 'dashed')
  })

  it('样式注册表为 Record 且 cell.s 为字符串 id（Univer 0.25.1 契约）', () => {
    const grid: TemplateGrid = {
      colWidths: [48],
      rowHeights: [15, 15],
      cells: [
        { row: 0, col: 0, rowSpan: 1, colSpan: 1, text: 'A', style: { bold: true } },
        { row: 1, col: 0, rowSpan: 1, colSpan: 1, text: 'B', style: { bold: true } },
      ],
    }
    const workbook = templateGridToWorkbookData(grid, pageConfig)
    const sheet = workbook.sheets[workbook.sheetOrder[0]]
    const s0 = sheet.cellData[0]?.[0]?.s
    const s1 = sheet.cellData[1]?.[0]?.s
    assert.equal(typeof s0, 'string')
    assert.equal(s0, s1) // 相同样式复用同一 id
    assert.equal(typeof workbook.styles[s0 as string], 'object')
    // 读取侧兼容：历史数组形态 + 数值下标也能解析（防御真实快照之外的形态）
    const legacy = workbookDataToTemplateGrid(
      {
        id: 'w',
        sheetOrder: ['s'],
        styles: [{ it: 1 }],
        sheets: {
          s: {
            id: 's',
            name: 'x',
            cellData: { 0: { 0: { v: 'L', s: 0 } } },
            columnData: {},
            rowData: {},
            mergeData: [],
            rowCount: 1,
            columnCount: 1,
          },
        },
      },
      pageConfig
    )
    assert.deepEqual(legacy.cells[0].style, { italic: true })
  })
})
