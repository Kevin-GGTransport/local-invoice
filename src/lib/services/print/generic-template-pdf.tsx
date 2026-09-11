/**
 * 账单模版 —— 通用 PDF 渲染器
 * 消费 renderTemplateData 的输出网格，按列宽/行高累计坐标绝对定位，
 * 网格超宽时等比缩放适配页面内容区。与 HTML 预览共用同一数据源与
 * cell-layout 排版模型（Excel 式右溢出 + 单行缩字号），保证所见即所得。
 * react-pdf 无 z-index（画序 = 文档顺序），故先画全部背景/边框，再画全部文本，
 * 使溢出文本能压在右侧空单元格的填充之上。
 */

import React from 'react'
import path from 'node:path'
import { Document, Font, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import { layoutCellText } from '@/lib/templates/cell-layout'
import { widthToLineStyle } from '@/lib/templates/border-style'
import { templateRenderColor } from '@/lib/templates/color'
import type { TemplateBorderLineStyle, TemplateGrid, TemplatePageConfig } from '@/lib/templates/types'

export { fitSingleLineFontSize } from '@/lib/templates/cell-layout'

export interface GenericTemplateDocumentProps {
  pageConfig: TemplatePageConfig
  grid: TemplateGrid
}

const PAGE_SIZES: Record<TemplatePageConfig['size'], [number, number]> = {
  A4: [595.28, 841.89],
  LETTER: [612, 792],
}

const PDF_FONT_FAMILY = 'Noto Sans SC'

/** 线型 → react-pdf BorderStyle；double 由外层实线 + 内层细线双 View 模拟 */
const PDF_BORDER_STYLE: Record<Exclude<TemplateBorderLineStyle, 'double'>, 'solid' | 'dashed' | 'dotted'> = {
  thin: 'solid',
  medium: 'solid',
  thick: 'solid',
  dashed: 'dashed',
  dotted: 'dotted',
}

function pdfBorderStyle(line: TemplateBorderLineStyle | undefined): 'solid' | 'dashed' | 'dotted' {
  if (line && line !== 'double') return PDF_BORDER_STYLE[line]
  return 'solid'
}

// PDF 必须嵌入中文字形；依赖操作系统字体会导致开发机正常、服务器打印乱码。
// 同一个可变字体文件覆盖常规和粗体，且保留 Helvetica 配置的历史模板也会自动升级。
Font.register({
  family: PDF_FONT_FAMILY,
  fonts: [
    { src: path.join(process.cwd(), 'public', 'NotoSansSC-VF.ttf'), fontWeight: 400 },
    { src: path.join(process.cwd(), 'public', 'NotoSansSC-VF.ttf'), fontWeight: 700 },
  ],
})

function fontFamily(style: { bold?: boolean; italic?: boolean }, base: string): string {
  if (base === PDF_FONT_FAMILY) return base
  const prefix = base.replace(/-(Bold|Oblique|BoldOblique)$/, '')
  if (style.bold && style.italic) return `${prefix}-BoldOblique`
  if (style.bold) return `${prefix}-Bold`
  if (style.italic) return `${prefix}-Oblique`
  return prefix
}

export function GenericTemplateDocument({ pageConfig, grid }: GenericTemplateDocumentProps) {
  const containsCjk = grid.cells.some((cell) => /[\u3000-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef]/.test(cell.text))
  const baseFontFamily =
    pageConfig.fontFamily === PDF_FONT_FAMILY || containsCjk ? PDF_FONT_FAMILY : pageConfig.fontFamily
  const [pageW, pageH] = PAGE_SIZES[pageConfig.size] ?? PAGE_SIZES.A4
  const margin = pageConfig.margin
  const contentW = pageW - margin.left - margin.right
  const contentH = pageH - margin.top - margin.bottom

  const colX: number[] = [0]
  for (const w of grid.colWidths) colX.push(colX[colX.length - 1] + w)
  const rowY: number[] = [0]
  for (const h of grid.rowHeights) rowY.push(rowY[rowY.length - 1] + h)
  const gridW = colX[colX.length - 1]
  const gridH = rowY[rowY.length - 1]

  const scale = Math.min(1, contentW / gridW, contentH / gridH)

  const styles = StyleSheet.create({
    page: {
      paddingTop: margin.top,
      paddingRight: margin.right,
      paddingBottom: margin.bottom,
      paddingLeft: margin.left,
      fontFamily: baseFontFamily,
      fontSize: pageConfig.baseFontSize,
      color: templateRenderColor(pageConfig.textColor) ?? '#000000',
    },
    canvas: {
      position: 'relative',
      width: gridW * scale,
      height: gridH * scale,
    },
  })

  // 与背景遍共用的格矩形（含合并跨度，钳制在网格范围内）
  const cellRect = (cell: TemplateGrid['cells'][number]) => {
    const left = (colX[cell.col] ?? 0) * scale
    const top = (rowY[cell.row] ?? 0) * scale
    const right = (colX[Math.min(cell.col + cell.colSpan, colX.length - 1)] ?? gridW) * scale
    const bottom = (rowY[Math.min(cell.row + cell.rowSpan, rowY.length - 1)] ?? gridH) * scale
    return { left, top, width: right - left, height: bottom - top }
  }

  return (
    <Document conformance="PDF/A-2b">
      <Page size={pageConfig.size} style={styles.page}>
        <View style={styles.canvas}>
          {/* 第一遍：背景 + 边框（原始格矩形） */}
          {grid.cells.map((cell, i) => {
            const { left, top, width, height } = cellRect(cell)
            const b = cell.style.borders
            const lineOf = (side: 'top' | 'right' | 'bottom' | 'left'): TemplateBorderLineStyle | undefined =>
              b?.styles?.[side] ?? (b?.[side] != null ? widthToLineStyle(b[side]!) : undefined)
            const doubleSides = (['top', 'right', 'bottom', 'left'] as const).filter(
              (side) => lineOf(side) === 'double' && b?.[side] != null
            )
            return (
              <React.Fragment key={`bg-${i}`}>
                <View
                  style={{
                    position: 'absolute',
                    left,
                    top,
                    width,
                    height,
                    backgroundColor: templateRenderColor(cell.style.fill) ?? undefined,
                    borderWidth: 0,
                    borderTopWidth: b?.top != null ? b.top * scale : 0,
                    borderRightWidth: b?.right != null ? b.right * scale : 0,
                    borderBottomWidth: b?.bottom != null ? b.bottom * scale : 0,
                    borderLeftWidth: b?.left != null ? b.left * scale : 0,
                    borderColor: templateRenderColor(b?.color) ?? '#000000',
                    borderTopStyle: pdfBorderStyle(lineOf('top')),
                    borderRightStyle: pdfBorderStyle(lineOf('right')),
                    borderBottomStyle: pdfBorderStyle(lineOf('bottom')),
                    borderLeftStyle: pdfBorderStyle(lineOf('left')),
                  }}
                />
                {doubleSides.length > 0 ? (
                  // double：内缩细线与外线组成双线
                  <View
                    style={{
                      position: 'absolute',
                      left: left + 1.5 * scale,
                      top: top + 1.5 * scale,
                      width: Math.max(0, width - 3 * scale),
                      height: Math.max(0, height - 3 * scale),
                      borderWidth: 0,
                      borderTopWidth: doubleSides.includes('top') ? 0.5 * scale : 0,
                      borderRightWidth: doubleSides.includes('right') ? 0.5 * scale : 0,
                      borderBottomWidth: doubleSides.includes('bottom') ? 0.5 * scale : 0,
                      borderLeftWidth: doubleSides.includes('left') ? 0.5 * scale : 0,
                      borderColor: templateRenderColor(b?.color) ?? '#000000',
                    }}
                  />
                ) : null}
              </React.Fragment>
            )
          })}
          {/* 第二遍：文本（盒可为左/右溢出扩展宽度，画在空邻居填充之上） */}
          {grid.cells
            .filter((cell) => cell.text)
            .map((cell, i) => {
              const { top, height } = cellRect(cell)
              const s = cell.style
              const { textBoxLeft, textBoxWidth, fontSize } = layoutCellText(
                grid,
                cell,
                s.fontSize ?? pageConfig.baseFontSize
              )
              return (
                <View
                  key={`tx-${i}`}
                  style={{
                    position: 'absolute',
                    left: textBoxLeft * scale,
                    top,
                    width: textBoxWidth * scale,
                    height,
                    // 垂直方向零 padding + 行高 1.1：避免小行高单元格因放不下文本被 react-pdf 丢弃
                    paddingTop: 0,
                    paddingRight: 3 * scale,
                    paddingBottom: 0,
                    paddingLeft: 3 * scale,
                    justifyContent:
                      s.valign === 'bottom' ? 'flex-end' : s.valign === 'middle' ? 'center' : 'flex-start',
                    overflow: 'hidden',
                  }}
                >
                  <Text
                    style={{
                      // 打印文字统一使用黑色粗体，避免模版浅色字在纸张上难以辨认。
                      fontFamily: fontFamily({ ...s, bold: true }, baseFontFamily),
                      fontWeight: baseFontFamily === PDF_FONT_FAMILY ? 700 : undefined,
                      fontSize: fontSize * scale,
                      lineHeight: 1.1,
                      color: '#000000',
                      textAlign: s.halign ?? 'left',
                      width: '100%',
                      textDecoration:
                        s.underline && s.strike
                          ? 'underline line-through'
                          : s.underline
                            ? 'underline'
                            : s.strike
                              ? 'line-through'
                              : undefined,
                      // 含显式换行符的多行单元格不限制行数，避免 maxLines 截掉第二行
                      maxLines: s.wrap || cell.text.includes('\n') ? undefined : 1,
                    }}
                  >
                    {cell.text}
                  </Text>
                </View>
              )
            })}
        </View>
      </Page>
    </Document>
  )
}
