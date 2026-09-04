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

/** 解开 PDF 内容流，按顺序拼接全部解压后的流内容（含 Tf 字号操作符） */
async function renderPdfStream(grid: TemplateGrid): Promise<string> {
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
      all += zlib.inflateSync(buf.subarray(start, end)).toString('latin1')
    } catch {
      // 非压缩流（字体等）跳过
    }
    i = end
  }
  return all
}

/** 在内容流中按顺序拼接全部文本（TJ 数组片段在流内连续） */
async function renderPdfText(grid: TemplateGrid): Promise<string> {
  const stream = await renderPdfStream(grid)
  let all = ''
  for (const m of stream.matchAll(/<([0-9A-Fa-f\s]+)>/g)) {
    all += Buffer.from(m[1].replace(/\s/g, ''), 'hex').toString('latin1')
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

  it('G&G 页脚形网格：长文本溢出到右侧空列，以原字号 11pt 完整输出', async () => {
    // 网格 427.3×20pt < A4 内容区（495.28×741.89）→ page-fit scale = 1，Tf 字号即实际字号
    const grid: TemplateGrid = {
      colWidths: [85.5, 141.8, 200],
      rowHeights: [20],
      cells: [
        {
          row: 0,
          col: 0,
          rowSpan: 1,
          colSpan: 1,
          // G&G 模板页脚：长文本在窄列、右侧空列同填充色（Excel 溢出排版）
          text: 'MAKE ALL CHECKS PAYABLE TO:',
          style: { fontSize: 11, fill: '#CECDE9' },
        },
        { row: 0, col: 1, rowSpan: 1, colSpan: 1, text: '', style: { fill: '#CECDE9' } },
      ],
    }
    const text = await renderPdfText(grid)
    assert.ok(text.includes('MAKE ALL CHECKS PAYABLE TO:'), `PDF 应包含完整页脚文本，实际文本：${text}`)
    const stream = await renderPdfStream(grid)
    assert.match(stream, /\/F\d+ 11 Tf/, `溢出后应保留 11pt 原字号，实际流：${stream.slice(0, 500)}`)
    assert.doesNotMatch(stream, /\/F\d+ 5\.5 Tf/, '不应回退到缩号后的 5.5pt')
  })

  it('右邻居有文本时不溢出，字号收缩到 5.5pt 下限', async () => {
    const grid: TemplateGrid = {
      colWidths: [85.5, 141.8, 200],
      rowHeights: [20],
      cells: [
        {
          row: 0,
          col: 0,
          rowSpan: 1,
          colSpan: 1,
          text: 'MAKE ALL CHECKS PAYABLE TO:',
          style: { fontSize: 11 },
        },
        { row: 0, col: 1, rowSpan: 1, colSpan: 1, text: 'X', style: {} },
      ],
    }
    const stream = await renderPdfStream(grid)
    assert.match(stream, /\/F\d+ 5\.5 Tf/, '右邻居有文本时应按原格宽缩号到 5.5pt 下限')
  })

  it('AA 行 8 场景：右对齐窄日期向左溢出到空列，与宽日期同样输出 10pt', async () => {
    // 网格 285.3×20pt < A4 内容区 → scale = 1，Tf 字号即实际字号
    const grid: TemplateGrid = {
      colWidths: [40, 120, 37.5, 87.8],
      rowHeights: [20],
      cells: [
        { row: 0, col: 0, rowSpan: 1, colSpan: 1, text: 'PICKUPS', style: { bold: true, fontSize: 11 } },
        { row: 0, col: 1, rowSpan: 1, colSpan: 1, text: '', style: {} },
        {
          row: 0,
          col: 2,
          rowSpan: 1,
          colSpan: 1,
          // AA 模板 pickup 日期：37.5pt 窄格、右对齐、左侧空列
          text: '08/19/2026',
          style: { halign: 'right', fontSize: 10 },
        },
        {
          row: 0,
          col: 3,
          rowSpan: 1,
          colSpan: 1,
          // AA 模板 drop 日期：87.8pt 宽格、右对齐
          text: '08/20/2026',
          style: { halign: 'right', fontSize: 10 },
        },
      ],
    }
    const text = await renderPdfText(grid)
    assert.ok(text.includes('08/19/2026'), `PDF 应包含 pickup 日期，实际文本：${text}`)
    assert.ok(text.includes('08/20/2026'), `PDF 应包含 drop 日期，实际文本：${text}`)
    const stream = await renderPdfStream(grid)
    const tenPtCount = (stream.match(/\/F\d+ 10 Tf/g) ?? []).length
    assert.ok(
      tenPtCount >= 2,
      `两个日期都应以 10pt 输出（实际 10pt 文本段 ${tenPtCount} 个），流片段：${stream.slice(0, 500)}`
    )
    assert.doesNotMatch(stream, /\/F\d+ (5\.5|6\.\d+) Tf/, '日期不应再被缩号')
  })
})
