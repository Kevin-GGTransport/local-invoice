// src/lib/templates/__tests__/auto-fit-row-heights.test.ts
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { wrapTextLines, LINE_HEIGHT_FACTOR } from '../cell-layout'
import { autoFitRowHeights } from '../auto-fit-row-heights'
import type { TemplateGrid } from '../types'

function cell(row: number, col: number, text: string, style: Record<string, unknown> = {}) {
  return { row, col, rowSpan: 1, colSpan: 1, text, style } as TemplateGrid['cells'][number]
}

function grid(cells: TemplateGrid['cells'], rows = 3, cols = 2): TemplateGrid {
  return { colWidths: Array.from({ length: cols }, () => 50), rowHeights: Array.from({ length: rows }, () => 20), cells }
}

describe('wrapTextLines', () => {
  it('按宽度折行，尊重显式换行，CJK 按 1em 估宽', () => {
    // 50pt 宽 / 10pt 字号 = 5em；6 个 CJK 字符 → 2 行
    assert.deepEqual(wrapTextLines('发票号码测试', 10, 50), ['发票号码测', '试'])
    assert.deepEqual(wrapTextLines('ab\ncd', 10, 100), ['ab', 'cd'])
    assert.deepEqual(wrapTextLines('', 10, 100), [''])
  })
})

describe('autoFitRowHeights', () => {
  it('wrap 格按行数撑开行高', () => {
    const g = grid([cell(0, 0, '一二三四五六七八九十', { wrap: true })])
    // 盒宽 50-6=44pt / 10pt = 4.4em → 每行 4 字 → 3 行 → 3 × 10 × 1.3 + 2 = 41
    const out = autoFitRowHeights(g)
    assert.equal(out.rowHeights[0], 41)
    assert.equal(out.rowHeights[1], 20)
  })

  it('coords 限定时非目标格不撑高', () => {
    const g = grid([cell(0, 0, '一二三四五六七八九十', { wrap: true }), cell(1, 0, '一二三四五六七八九十', { wrap: true })])
    const out = autoFitRowHeights(g, new Set(['1:0']))
    assert.equal(out.rowHeights[0], 20)
    assert.equal(out.rowHeights[1], 41)
  })

  it('原行高更大时保持不变（返回原对象引用）', () => {
    const g = grid([cell(0, 0, '一', { wrap: true })])
    g.rowHeights[0] = 60
    assert.equal(autoFitRowHeights(g), g)
  })

  it('合并单元格跨行时高度均摊', () => {
    const g = grid([cell(0, 0, '一二三四五六七八九十', { wrap: true })])
    g.cells[0].rowSpan = 2
    const out = autoFitRowHeights(g)
    const total = out.rowHeights[0] + out.rowHeights[1]
    assert.ok(total >= 3 * 10 * LINE_HEIGHT_FACTOR + 1.9, `总高 ${total} 应按 3 行撑开`)
  })
})
