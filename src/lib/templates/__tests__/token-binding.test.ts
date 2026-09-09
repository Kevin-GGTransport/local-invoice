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

  it('明细令牌同行推导 lineItems（单行区域 + 列角色）', () => {
    const g = grid([cell(1, 0, '{{描述}}'), cell(1, 1, '{{数量}}'), cell(1, 2, '{{单价}}'), cell(1, 3, '{{金额}}')])
    const { binding } = deriveBindingFromGrid(g, { minRows: 7 })
    assert.deepEqual(binding.lineItems, {
      startRow: 1,
      endRow: 1,
      columns: { description: 0, quantity: 1, unitPrice: 2, amount: 3 },
      minRows: 7,
    })
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

  it('minRows 缺省为 10', () => {
    const g = grid([cell(0, 0, '{{描述}}')])
    assert.equal(deriveBindingFromGrid(g).binding.lineItems?.minRows, 10)
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
