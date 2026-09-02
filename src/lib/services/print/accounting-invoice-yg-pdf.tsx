/**
 * 陆运账单 PDF —— YG 模版（YG Trucking LLC，粉色系，版式照业务样张）
 * 页眉粉条内含公司名+首行地址；明细表列宽 Description:Qty:Rate:Amount ≈ 4.3:1:1.25:1.4，
 * 含 ~14 行空白，Description 数据左对齐、Rate/Amount 右对齐；页脚随内容流式排布
 * 纯英文内容，使用内置 Helvetica，无需注册中文字体
 */

import React from 'react'
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import type { AccountingInvoicePdfPayload } from './accounting-invoice-pdf-types'
import {
  YG_PDF_COMPANY_NAME,
  YG_PDF_ADDRESS_LINES,
  YG_PDF_PHONE,
  YG_PDF_EMAIL,
} from './accounting-invoice-pdf-types'

const PINK = '#F9CBD3' // 页眉横条 / 表头
const BLACK = '#000000'
const FONT = 'Helvetica'
/** 明细表（含数据行）总行数，还原样张的大面积留白（1 行数据 + ~14 行空白） */
const DETAIL_TOTAL_ROWS = 15

const borderedCell = {
  borderWidth: 1,
  borderColor: BLACK,
}

const styles = StyleSheet.create({
  page: {
    padding: 50,
    fontSize: 10,
    fontFamily: FONT,
    color: BLACK,
  },
  // —— 页眉粉色横条（公司名 + 首行地址在条内） ——
  headerBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: PINK,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  headerBarLeft: {
    flexDirection: 'column',
  },
  headerCompany: {
    fontSize: 12,
  },
  headerAddress: {
    fontSize: 10,
  },
  headerInvoice: {
    fontSize: 13,
  },
  // —— 地址 + 右上 Date/Invoice# 2×2 小表 ——
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  infoLeft: {
    maxWidth: '55%',
    paddingTop: 4,
  },
  infoLeftLine: {
    fontSize: 10,
    lineHeight: 1.4,
  },
  metaTable: {
    width: 215,
  },
  metaRow: {
    flexDirection: 'row',
  },
  metaCell: {
    ...borderedCell,
    flex: 1,
    fontSize: 10,
    paddingVertical: 4,
    paddingHorizontal: 6,
    textAlign: 'center',
  },
  metaLabel: {
    fontWeight: 'bold',
  },
  // —— Bill To 方框 ——
  billToBox: {
    ...borderedCell,
    padding: 8,
    marginBottom: 12,
    width: 255,
  },
  billToLabel: {
    fontSize: 10,
    marginBottom: 3,
  },
  billToName: {
    fontSize: 11,
  },
  // —— 分页标记（右对齐于明细表右缘） ——
  pageOf: {
    textAlign: 'right',
    fontSize: 10,
    marginBottom: 8,
  },
  // —— 明细表（Description:Qty:Rate:Amount ≈ 4.3:1:1.25:1.4） ——
  detailTable: {
    borderWidth: 1,
    borderColor: BLACK,
  },
  detailHead: {
    flexDirection: 'row',
    backgroundColor: PINK,
    borderBottomWidth: 1,
    borderBottomColor: BLACK,
  },
  detailHeadCell: {
    flex: 4.3,
    fontSize: 10,
    fontWeight: 'bold',
    textAlign: 'center',
    paddingVertical: 6,
    borderRightWidth: 1,
    borderRightColor: BLACK,
  },
  detailHeadCellQty: {
    flex: 1,
    fontSize: 10,
    fontWeight: 'bold',
    textAlign: 'center',
    paddingVertical: 6,
    borderRightWidth: 1,
    borderRightColor: BLACK,
  },
  detailHeadCellRate: {
    flex: 1.25,
    fontSize: 10,
    fontWeight: 'bold',
    textAlign: 'center',
    paddingVertical: 6,
    borderRightWidth: 1,
    borderRightColor: BLACK,
  },
  detailHeadCellLast: {
    flex: 1.4,
    fontSize: 10,
    fontWeight: 'bold',
    textAlign: 'center',
    paddingVertical: 6,
  },
  detailRow: {
    flexDirection: 'row',
    minHeight: 22,
    borderBottomWidth: 1,
    borderBottomColor: BLACK,
  },
  detailRowLast: {
    flexDirection: 'row',
    minHeight: 22,
  },
  detailCell: {
    flex: 4.3,
    fontSize: 10,
    textAlign: 'left',
    paddingLeft: 8,
    paddingVertical: 5,
    borderRightWidth: 1,
    borderRightColor: BLACK,
  },
  detailCellQty: {
    flex: 1,
    fontSize: 10,
    textAlign: 'center',
    paddingVertical: 5,
    borderRightWidth: 1,
    borderRightColor: BLACK,
  },
  detailCellRate: {
    flex: 1.25,
    fontSize: 10,
    paddingVertical: 5,
    borderRightWidth: 1,
    borderRightColor: BLACK,
  },
  detailCellLast: {
    flex: 1.4,
    fontSize: 10,
    paddingVertical: 5,
  },
  detailAmount: {
    textAlign: 'right',
    paddingRight: 10,
  },
  // —— 合计区（网格线延续） ——
  totalRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: BLACK,
  },
  totalThanks: {
    flex: 4.3,
    fontSize: 10,
    textAlign: 'left',
    paddingLeft: 8,
    paddingVertical: 5,
    borderRightWidth: 1,
    borderRightColor: BLACK,
  },
  totalLabelCell: {
    flex: 1,
    fontSize: 10,
    fontWeight: 'bold',
    textAlign: 'center',
    paddingVertical: 5,
    borderRightWidth: 1,
    borderRightColor: BLACK,
  },
  totalSpacer: {
    flex: 1.25,
    borderRightWidth: 1,
    borderRightColor: BLACK,
  },
  totalValueCell: {
    flex: 1.4,
    fontSize: 10,
    textAlign: 'right',
    paddingVertical: 5,
    paddingRight: 10,
  },
  balanceRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: BLACK,
  },
  balanceLabel: {
    flex: 6.55,
    fontSize: 13,
    fontWeight: 'bold',
    textAlign: 'right',
    paddingVertical: 6,
    paddingRight: 10,
  },
  balanceValue: {
    flex: 1.4,
    fontSize: 12,
    textAlign: 'right',
    paddingVertical: 6,
    paddingRight: 10,
  },
  // —— 页脚 2×2 小表（随内容流式，内容居中） ——
  footer: {
    marginTop: 40,
    width: 270,
  },
  footerRow: {
    flexDirection: 'row',
  },
  footerCell: {
    ...borderedCell,
    flex: 1,
    fontSize: 9,
    paddingVertical: 4,
    paddingHorizontal: 6,
    textAlign: 'center',
  },
})

export function AccountingInvoiceYgDocument({ data }: { data: AccountingInvoicePdfPayload }) {
  const blankRows = Math.max(0, DETAIL_TOTAL_ROWS - data.lines.length)

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* 页眉粉色横条（公司名 + 首行地址在条内） */}
        <View style={styles.headerBar}>
          <View style={styles.headerBarLeft}>
            <Text style={styles.headerCompany}>{YG_PDF_COMPANY_NAME}</Text>
            <Text style={styles.headerAddress}>{YG_PDF_ADDRESS_LINES[0]}</Text>
          </View>
          <Text style={styles.headerInvoice}>Invoice</Text>
        </View>

        {/* 地址（左） + Date/Invoice# 2×2 小表（右） */}
        <View style={styles.infoRow}>
          <View style={styles.infoLeft}>
            {YG_PDF_ADDRESS_LINES.slice(1).map((line) => (
              <Text key={line} style={styles.infoLeftLine}>
                {line}
              </Text>
            ))}
          </View>
          <View style={styles.metaTable}>
            <View style={styles.metaRow}>
              <Text style={[styles.metaCell, styles.metaLabel]}>Date</Text>
              <Text style={styles.metaCell}>Invoice #</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={[styles.metaCell, { borderTopWidth: 0 }]}>{data.invoiceDate}</Text>
              <Text style={[styles.metaCell, { borderTopWidth: 0 }]}>{data.invoiceNumber}</Text>
            </View>
          </View>
        </View>

        {/* Bill To 方框 */}
        <View style={styles.billToBox}>
          <Text style={styles.billToLabel}>Bill To:</Text>
          <Text style={styles.billToName}>{data.billTo}</Text>
        </View>

        {/* 分页标记 */}
        <Text style={styles.pageOf}>Page 1 of 1</Text>

        {/* 明细表：数据行 + 补足空白行 */}
        <View style={styles.detailTable}>
          <View style={styles.detailHead}>
            <Text style={styles.detailHeadCell}>Description</Text>
            <Text style={styles.detailHeadCellQty}>Qty</Text>
            <Text style={styles.detailHeadCellRate}>Rate</Text>
            <Text style={styles.detailHeadCellLast}>Amount</Text>
          </View>
          {data.lines.map((line, i) => (
            <View
              key={i}
              style={blankRows === 0 && i === data.lines.length - 1 ? styles.detailRowLast : styles.detailRow}
            >
              <Text style={styles.detailCell}>{line.description}</Text>
              <Text style={styles.detailCellQty}>{line.quantity}</Text>
              <Text style={[styles.detailCellRate, styles.detailAmount]}>{line.unitPrice}</Text>
              <Text style={[styles.detailCellLast, styles.detailAmount]}>{line.amount}</Text>
            </View>
          ))}
          {Array.from({ length: blankRows }).map((_, i) => (
            <View
              key={`blank-${i}`}
              style={i === blankRows - 1 ? styles.detailRowLast : styles.detailRow}
            />
          ))}
          {/* Total 行：Description 列写 Thank you for your business */}
          <View style={styles.totalRow}>
            <Text style={styles.totalThanks}>Thank you for your business</Text>
            <Text style={styles.totalLabelCell}>Total</Text>
            <View style={styles.totalSpacer} />
            <Text style={styles.totalValueCell}>{data.amount}</Text>
          </View>
          {/* Balance Due 行 */}
          <View style={styles.balanceRow}>
            <Text style={styles.balanceLabel}>Balance Due</Text>
            <Text style={styles.balanceValue}>{data.amount}</Text>
          </View>
        </View>

        {/* 页脚 2×2 小表 */}
        <View style={styles.footer}>
          <View style={styles.footerRow}>
            <Text style={styles.footerCell}>Phone#</Text>
            <Text style={styles.footerCell}>Email:</Text>
          </View>
          <View style={styles.footerRow}>
            <Text style={[styles.footerCell, { borderTopWidth: 0 }]}>{YG_PDF_PHONE}</Text>
            <Text style={[styles.footerCell, { borderTopWidth: 0 }]}>{YG_PDF_EMAIL}</Text>
          </View>
        </View>
      </Page>
    </Document>
  )
}
