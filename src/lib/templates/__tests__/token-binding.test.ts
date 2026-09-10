// src/lib/templates/__tests__/token-binding.test.ts
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  FIELD_TOKENS,
  DETAIL_TOKENS,
  deriveBindingFromGrid,
  containsFieldToken,
  replaceFieldToken,
} from '../token-binding'
import type { TemplateGrid } from '../types'

function cell(row: number, col: number, text: string) {
  return { row, col, rowSpan: 1, colSpan: 1, text, style: {} }
}

function grid(cells: ReturnType<typeof cell>[], rows = 8, cols = 6): TemplateGrid {
  return { colWidths: Array.from({ length: cols }, () => 50), rowHeights: Array.from({ length: rows }, () => 20), cells }
}

describe('deriveBindingFromGrid', () => {
  it('纯令牌格推导字段绑定（含同字段多格）', () => {
    const g = grid([cell(0, 1, '{{发票号}}'), cell(2, 0, '{{发票号}}'), cell(3, 3, '{{合计}}')])
    const { binding, unknownTokens, errors } = deriveBindingFromGrid(g)
    assert.deepEqual(binding.fields.invoice_number?.cells, [{ row: 0, col: 1 }, { row: 2, col: 0 }])
    assert.deepEqual(binding.fields.total?.cells, [{ row: 3, col: 3 }])
    assert.equal(binding.fields.total?.format, 'money')
    assert.deepEqual(unknownTokens, [])
    assert.deepEqual(errors, [])
  })

  it('令牌嵌在静态文本中也能推导，且空白宽容', () => {
    const g = grid([cell(0, 0, 'Invoice No: {{ 发票号 }}')])
    const { binding } = deriveBindingFromGrid(g)
    assert.deepEqual(binding.fields.invoice_number?.cells, [{ row: 0, col: 0 }])
  })

  it('明细令牌同行推导 lineItems（列角色 + 容量 1）', () => {
    const g = grid([
      cell(1, 0, '{{描述}}'),
      cell(1, 1, '{{数量}}'),
      cell(1, 2, '{{单价}}'),
      cell(1, 3, '{{金额}}'),
      cell(2, 0, 'TOTAL'), // 紧跟的含文本行阻止区域扩展
    ])
    const { binding } = deriveBindingFromGrid(g)
    assert.deepEqual(binding.lineItems, {
      startRow: 1,
      endRow: 1,
      columns: { description: 0, quantity: 1, unitPrice: 2, amount: 3 },
      minRows: 1,
    })
  })

  it('令牌行下方连续空行并入明细区域，遇首个含文本行停止', () => {
    const g = grid([
      cell(1, 0, '{{描述}}'),
      cell(1, 3, '{{金额}}'),
      cell(2, 0, ''),
      cell(2, 3, ''),
      cell(3, 0, ''),
      cell(4, 0, ''),
      cell(5, 0, '{{合计}}'),
    ])
    const { binding } = deriveBindingFromGrid(g)
    assert.equal(binding.lineItems?.startRow, 1)
    assert.equal(binding.lineItems?.endRow, 4)
    assert.equal(binding.lineItems?.minRows, 4)
    // 字段绑定位于区域外，不受影响
    assert.deepEqual(binding.fields.total?.cells, [{ row: 5, col: 0 }])
  })

  it('空行持续到网格末尾时区域扩展到最后一行', () => {
    const g = grid([cell(1, 0, '{{描述}}'), cell(2, 0, '')], 4)
    const { binding } = deriveBindingFromGrid(g)
    assert.equal(binding.lineItems?.endRow, 3)
    assert.equal(binding.lineItems?.minRows, 3)
  })

  it('无单元格的稀疏行同样计入区域容量', () => {
    const g = grid([cell(1, 0, '{{描述}}'), cell(3, 0, 'NOTE')])
    const { binding } = deriveBindingFromGrid(g)
    assert.equal(binding.lineItems?.endRow, 2)
    assert.equal(binding.lineItems?.minRows, 2)
  })

  it('仅含空白的行视为空行并入区域', () => {
    const g = grid([cell(1, 0, '{{描述}}'), cell(2, 0, '  '), cell(3, 0, 'X')])
    const { binding } = deriveBindingFromGrid(g)
    assert.equal(binding.lineItems?.endRow, 2)
  })

  it('明细令牌分散多行报结构错误', () => {
    const g = grid([cell(1, 0, '{{描述}}'), cell(2, 3, '{{金额}}')])
    const { binding, errors } = deriveBindingFromGrid(g)
    assert.equal(binding.lineItems, null)
    assert.ok(errors.length === 1 && errors[0].includes('明细令牌'))
  })

  it('同一明细令牌出现在同行不同列报错', () => {
    const g = grid([cell(1, 0, '{{描述}}'), cell(1, 4, '{{描述}}')])
    const { errors } = deriveBindingFromGrid(g)
    assert.ok(errors.some((e) => e.includes('{{描述}}')))
  })

  it('未知令牌收集为警告不报错', () => {
    const g = grid([cell(0, 0, '{{不存在}}'), cell(1, 0, '{{发票号}}{{另一个}}')])
    const { unknownTokens, errors } = deriveBindingFromGrid(g)
    assert.deepEqual([...unknownTokens].sort(), ['不存在', '另一个'])
    assert.deepEqual(errors, [])
  })

  it('minRows 恒等于区域行数（令牌行 + 吸收的空行）', () => {
    const g = grid([cell(0, 0, '{{描述}}')])
    const li = deriveBindingFromGrid(g).binding.lineItems!
    assert.equal(li.minRows, li.endRow - li.startRow + 1)
    assert.equal(li.minRows, 8) // 网格 8 行、下方全空 → 容量 8
  })
})

describe('containsFieldToken / replaceFieldToken', () => {
  it('检测与替换（含空白变体、多处出现）', () => {
    const text = 'Invoice No: {{发票号}} / {{ 发票号 }}'
    assert.equal(containsFieldToken(text, 'invoice_number'), true)
    assert.equal(containsFieldToken(text, 'total'), false)
    assert.equal(replaceFieldToken(text, 'invoice_number', 'A1'), 'Invoice No: A1 / A1')
    // 令牌含正则元字符（Load No. 的点号）不被误解释
    assert.equal(replaceFieldToken('L: {{Load No.}}', 'load_number', '99'), 'L: 99')
  })
})
