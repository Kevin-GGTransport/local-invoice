/**
 * 账单模版 —— 通用 PDF 渲染器
 * 消费 renderTemplateData 的输出网格，按列宽/行高累计坐标绝对定位，
 * 网格超宽时等比缩放适配页面内容区。与 HTML 预览共用同一数据源与
 * cell-layout 排版模型（Excel 式右溢出 + 单行缩字号），保证所见即所得。
 * react-pdf 无 z-index（画序 = 文档顺序），故先画全部背景/边框，再画全部文本，
 * 使溢出文本能压在右侧空单元格的填充之上。
 */

import React from 'react'
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import { layoutCellText } from '@/lib/templates/cell-layout'
import type { TemplateGrid, TemplatePageConfig } from '@/lib/templates/types'

export { fitSingleLineFontSize } from '@/lib/templates/cell-layout'

export interface GenericTemplateDocumentProps {
  pageConfig: TemplatePageConfig
  grid: TemplateGrid
}

const PAGE_SIZES: Record<TemplatePageConfig['size'], [number, number]> = {
  A4: [595.28, 841.89],
  LETTER: [612, 792],
}

function fontFamily(style: { bold?: boolean; italic?: boolean }, base: string): string {
  const prefix = base.replace(/-(Bold|Oblique|BoldOblique)$/, '')
  if (style.bold && style.italic) return `${prefix}-BoldOblique`
  if (style.bold) return `${prefix}-Bold`
  if (style.italic) return `${prefix}-Oblique`
  return prefix
}

export function GenericTemplateDocument({ pageConfig, grid }: GenericTemplateDocumentProps) {
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
      fontFamily: pageConfig.fontFamily,
      fontSize: pageConfig.baseFontSize,
      color: pageConfig.textColor,
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
    <Document>
      <Page size={pageConfig.size} style={styles.page}>
        <View style={styles.canvas}>
          {/* 第一遍：背景 + 边框（原始格矩形） */}
          {grid.cells.map((cell, i) => {
            const { left, top, width, height } = cellRect(cell)
            const b = cell.style.borders
            return (
              <View
                key={`bg-${i}`}
                style={{
                  position: 'absolute',
                  left,
                  top,
                  width,
                  height,
                  backgroundColor: cell.style.fill,
                  borderWidth: 0,
                  borderTopWidth: b?.top != null ? b.top * scale : 0,
                  borderRightWidth: b?.right != null ? b.right * scale : 0,
                  borderBottomWidth: b?.bottom != null ? b.bottom * scale : 0,
                  borderLeftWidth: b?.left != null ? b.left * scale : 0,
                  borderColor: b?.color ?? '#000000',
                }}
              />
            )
          })}
          {/* 第二遍：文本（盒宽可为溢出扩展宽度，画在空邻居填充之上） */}
          {grid.cells
            .filter((cell) => cell.text)
            .map((cell, i) => {
              const { left, top, width, height } = cellRect(cell)
              const s = cell.style
              const { textBoxWidth, fontSize } = layoutCellText(
                grid,
                cell,
                width / scale,
                s.fontSize ?? pageConfig.baseFontSize
              )
              return (
                <View
                  key={`tx-${i}`}
                  style={{
                    position: 'absolute',
                    left,
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
                      fontFamily: fontFamily(s, pageConfig.fontFamily),
                      fontSize: fontSize * scale,
                      lineHeight: 1.1,
                      color: s.color ?? pageConfig.textColor,
                      textAlign: s.halign ?? 'left',
                      width: '100%',
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
