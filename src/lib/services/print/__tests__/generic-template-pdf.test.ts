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
  it('嵌入中文字体并可生成包含中文的 PDF', async () => {
    const grid: TemplateGrid = {
      colWidths: [240],
      rowHeights: [24],
      cells: [
        { row: 0, col: 0, rowSpan: 1, colSpan: 1, text: '中文账单：客户名称', style: { bold: true } },
      ],
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const element: React.ReactElement<any> = React.createElement(GenericTemplateDocument, {
      pageConfig: PAGE_CONFIG,
      grid,
    })
    const pdf = Buffer.from(await renderToBuffer(element))
    assert.ok(pdf.length > 1_000, '中文 PDF 应成功生成并嵌入字体')
    assert.match(pdf.toString('latin1'), /\/FontFile[23]/, 'PDF 应包含嵌入的 TrueType/OpenType 字体')
    assert.ok(pdf.toString('latin1').includes('NotoSansSC-Bold'), 'PDF 应嵌入真正的 Noto Sans SC 粗体')
    assert.ok(pdf.toString('latin1').includes('/OutputIntents'), 'PDF 应包含 sRGB OutputIntent')
    assert.ok(pdf.toString('latin1').includes('sRGB IEC61966-2.1'), 'PDF 应声明标准 sRGB 输出条件')
  })

  it('AA / G&G / YG 品牌色以精确 sRGB 分量写入 PDF 内容流', async () => {
    const grid: TemplateGrid = {
      colWidths: [100],
      rowHeights: [20, 20, 20],
      cells: [
        { row: 0, col: 0, rowSpan: 1, colSpan: 1, text: '', style: { fill: '#F49B33' } },
        { row: 1, col: 0, rowSpan: 1, colSpan: 1, text: '', style: { fill: '#A5A0D2' } },
        { row: 2, col: 0, rowSpan: 1, colSpan: 1, text: '', style: { fill: '#F9CBD3' } },
      ],
    }
    const stream = await renderPdfStream(grid)
    assert.match(stream, /0\.9568627450980393 0\.6078431372549019 0\.2 scn/, 'AA 橙色应保持精确 sRGB')
    assert.match(stream, /0\.6470588235294118 0\.6274509803921569 0\.8235294117647058 scn/, 'G&G 紫色应保持精确 sRGB')
    assert.match(stream, /0\.9764705882352941 0\.796078431372549 0\.8274509803921568 scn/, 'YG 粉色应保持精确 sRGB')
  })

  it('打印文字忽略模版浅色和常规字重，统一输出黑色粗体', async () => {
    const grid: TemplateGrid = {
      colWidths: [240],
      rowHeights: [24],
      cells: [
        {
          row: 0,
          col: 0,
          rowSpan: 1,
          colSpan: 1,
          text: 'Invoice Number',
          style: { color: '#CCCCCC', bold: false },
        },
      ],
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const element: React.ReactElement<any> = React.createElement(GenericTemplateDocument, {
      pageConfig: { ...PAGE_CONFIG, textColor: '#AAAAAA' },
      grid,
    })
    const pdf = Buffer.from(await renderToBuffer(element))
    const stream = await renderPdfStream(grid)
    assert.ok(pdf.toString('latin1').includes('/BaseFont /Helvetica-Bold'), '应使用 Helvetica 粗体')
    assert.match(stream, /0 0 0 (?:rg|scn)/, '文字应使用纯黑色')
  })

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
          style: { fontSize: 11, fill: '#A5A0D2' },
        },
        { row: 0, col: 1, rowSpan: 1, colSpan: 1, text: '', style: { fill: '#A5A0D2' } },
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

  it('新样式写入绘制指令：dashed 虚线模式、double 内线、underline/strike 装饰线', async () => {
    const mk = (cells: TemplateGrid['cells']): TemplateGrid => ({ colWidths: [100], rowHeights: [20], cells })
    const base = { row: 0, col: 0, rowSpan: 1, colSpan: 1 }
    const strokeCount = (s: string) => (s.match(/\nS\n/g) ?? []).length
    const decorCount = (s: string) => (s.match(/0\.5 w/g) ?? []).length

    // dashed 边框 → 非空 dash 模式操作符（solid 只会输出 [] 0 d 复位）
    const dashed = await renderPdfStream(mk([{ ...base, text: '', style: { borders: { top: 2, styles: { top: 'dashed' } } } }]))
    assert.match(dashed, /\[[\d.]+ [\d.]+\] 0 d/, 'dashed 边框应写入非空 dash 模式')

    // double 边框 → 外线之内多画一条内缩细线（描边次数比单实线多一次）
    const solid = await renderPdfStream(mk([{ ...base, text: '', style: { borders: { bottom: 2 } } }]))
    const dbl = await renderPdfStream(mk([{ ...base, text: '', style: { borders: { bottom: 2, styles: { bottom: 'double' } } } }]))
    assert.equal(strokeCount(dbl), strokeCount(solid) + 1, 'double 应在外线之内多画一条细线')

    // underline / strike → 各画一条 0.5pt 装饰线（无装饰时为零）
    const plain = await renderPdfStream(mk([{ ...base, text: 'A', style: {} }]))
    const under = await renderPdfStream(mk([{ ...base, text: 'U', style: { underline: true } }]))
    const struck = await renderPdfStream(mk([{ ...base, text: 'S', style: { strike: true } }]))
    assert.equal(decorCount(plain), 0, '无装饰时不应有装饰线')
    assert.equal(decorCount(under), 1, 'underline 应画一条装饰线')
    assert.equal(decorCount(struck), 1, 'strike 应画一条装饰线')
  })
})
