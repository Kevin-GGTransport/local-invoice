/**
 * 账单模版 —— 通用 PDF 渲染器
 * 消费 renderTemplateData 的输出网格，按列宽/行高累计坐标绝对定位，
 * 网格超宽时等比缩放适配页面内容区。与 HTML 预览共用同一数据源。
 */

import React from 'react'
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import type { TemplateGrid, TemplatePageConfig } from '@/lib/templates/types'

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

/**
 * react-pdf 会把窄单元格中的文字自动换行，而 Excel 样张中的日期/编号通常是单行。
 * 对未开启 wrap 的单元格做保守的字宽估算，必要时缩小字号以完整放入格内。
 */
export function fitSingleLineFontSize(
  text: string,
  requestedSize: number,
  cellWidth: number,
  bold = false
): number {
  const availableWidth = Math.max(0, cellWidth - 6)
  if (!text || availableWidth === 0) return requestedSize

  let emWidth = 0
  for (const char of text) {
    if (/\d/.test(char)) emWidth += 0.56
    else if (/[A-Z]/.test(char)) emWidth += 0.65
    else if (/[a-z]/.test(char)) emWidth += 0.5
    else if (/\s/.test(char)) emWidth += 0.28
    else emWidth += 0.3
  }
  if (bold) emWidth *= 1.05

  const estimatedWidth = emWidth * requestedSize
  if (estimatedWidth <= availableWidth) return requestedSize
  return Math.max(5.5, Math.min(requestedSize, (requestedSize * availableWidth) / estimatedWidth))
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

  return (
    <Document>
      <Page size={pageConfig.size} style={styles.page}>
        <View style={styles.canvas}>
          {grid.cells.map((cell, i) => {
            const left = (colX[cell.col] ?? 0) * scale
            const top = (rowY[cell.row] ?? 0) * scale
            const right = (colX[Math.min(cell.col + cell.colSpan, colX.length - 1)] ?? gridW) * scale
            const bottom =
              (rowY[Math.min(cell.row + cell.rowSpan, rowY.length - 1)] ?? gridH) * scale
            const w = right - left
            const h = bottom - top
            const s = cell.style
            const b = s.borders
            const boxStyle: React.ComponentProps<typeof View>['style'] = {
              position: 'absolute',
              left,
              top,
              width: w,
              height: h,
              backgroundColor: s.fill,
              borderWidth: 0,
              borderTopWidth: b?.top != null ? b.top * scale : 0,
              borderRightWidth: b?.right != null ? b.right * scale : 0,
              borderBottomWidth: b?.bottom != null ? b.bottom * scale : 0,
              borderLeftWidth: b?.left != null ? b.left * scale : 0,
              borderColor: b?.color ?? '#000000',
              // 垂直方向零 padding + 行高 1.1：避免小行高单元格因放不下文本被 react-pdf 丢弃
              paddingTop: 0,
              paddingRight: 3 * scale,
              paddingBottom: 0,
              paddingLeft: 3 * scale,
              justifyContent:
                s.valign === 'bottom' ? 'flex-end' : s.valign === 'middle' ? 'center' : 'flex-start',
            }
            if (!cell.text) return <View key={i} style={boxStyle} />
            const requestedFontSize = s.fontSize ?? pageConfig.baseFontSize
            const fittedFontSize = s.wrap
              ? requestedFontSize
              : fitSingleLineFontSize(cell.text, requestedFontSize, w / scale, s.bold)
            return (
              <View key={i} style={[boxStyle, { overflow: 'hidden' }]}>
                <Text
                  style={{
                    fontFamily: fontFamily(s, pageConfig.fontFamily),
                    fontSize: fittedFontSize * scale,
                    lineHeight: 1.1,
                    color: s.color ?? pageConfig.textColor,
                    textAlign: s.halign ?? 'left',
                    width: '100%',
                    maxLines: s.wrap ? undefined : 1,
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
