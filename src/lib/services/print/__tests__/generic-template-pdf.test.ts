import assert from 'node:assert/strict'
import zlib from 'node:zlib'
import { describe, it } from 'node:test'

import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'

import { GenericTemplateDocument } from '../generic-template-pdf'
import type { TemplateGrid, TemplatePageConfig } from '@/lib/templates/types'

const PAGE_CONFIG: TemplatePageConfig = {
  size: 'A4',
  margin: { top: 50, right: 50, bottom: 50, left: 50 },
  fontFamily: 'Helvetica',
  baseFontSize: 10,
  textColor: '#000000',
}

/** 解开 PDF 内容流，按顺序拼接全部文本（TJ 数组片段在流内连续） */
async function renderPdfText(grid: TemplateGrid): Promise<string> {
  // 与 service 中的 JSX 写法一致：element 的 props 类型为 any，匹配 renderToBuffer 的 DocumentProps
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const element: React.ReactElement<any> = React.createElement(GenericTemplateDocument, {
    pageConfig: PAGE_CONFIG,
    grid,
  })
  const buf = Buffer.from(await renderToBuffer(element))
  const raw = buf.toString('latin1')
  let all = ''
  for (let i = 0; i + 6 < raw.length; ) {
    const s = raw.indexOf('stream', i)
    if (s === -1) break
    const start = raw.indexOf('\n', s) + 1
    const end = raw.indexOf('endstream', start)
    if (end === -1) break
    try {
      const decoded = zlib.inflateSync(buf.subarray(start, end)).toString('latin1')
      for (const m of decoded.matchAll(/<([0-9A-Fa-f\s]+)>/g)) {
        all += Buffer.from(m[1].replace(/\s/g, ''), 'hex').toString('latin1')
      }
    } catch {
      // 非压缩流（字体等）跳过
    }
    i = end
  }
  return all
}

describe('GenericTemplateDocument', () => {
  it('单元格内换行（非 wrap）的多行头部文本在 PDF 中完整保留', async () => {
    const grid: TemplateGrid = {
      colWidths: [267.8, 227.3],
      rowHeights: [32],
      cells: [
        {
          row: 0,
          col: 0,
          rowSpan: 1,
          colSpan: 1,
          // YG 模板头部第一格：Alt+Enter 换行且未开 wrapText
          text: 'YG Trucking LLC\nPO Box 6213',
          style: { fontSize: 12, valign: 'middle' },
        },
      ],
    }
    const text = await renderPdfText(grid)
    assert.ok(text.includes('YG Trucking LLC'), `PDF 应包含第一行，实际文本：${text}`)
    assert.ok(text.includes('PO Box 6213'), `PDF 应包含第二行，实际文本：${text}`)
  })
})
