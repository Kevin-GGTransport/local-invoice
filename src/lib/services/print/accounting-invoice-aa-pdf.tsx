/**
 * 陆运账单 PDF —— AA 模版（ALREADY ARRIVED LOGISTICS INC，橙色系，版式照业务样张）
 * 内容区约页面宽度 80%；明细表 DESCRIPTION:TOTAL ≈ 3:1，含 ~12 行空白；页脚随内容流式排布
 * 纯英文内容，使用内置 Helvetica，无需注册中文字体
 */

import React from 'react'
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import type { AccountingInvoicePdfPayload } from './accounting-invoice-pdf-types'
import {
  AA_PDF_COMPANY_NAME,
  AA_PDF_ADDRESS_LINES,
  AA_PDF_PHONE,
  AA_PDF_EMAIL,
} from './accounting-invoice-pdf-types'

const ORANGE = '#F49B33' // 页眉横条 / TOTAL DUE 单元格
const ORANGE_LIGHT = '#FDE5CD' // 明细表头
const ORANGE_LINE = '#F0B27A' // 明细行分隔线
const BLUE = '#1C4587' // 大标题 INVOICE
const BLACK = '#000000'
const FONT = 'Helvetica'
/** 明细表（含数据行）总行数，还原样张的大面积留白 */
const DETAIL_TOTAL_ROWS = 12

const styles = StyleSheet.create({
  page: {
    paddingTop: 46,
    paddingHorizontal: 60,
    fontSize: 10,
    fontFamily: FONT,
    color: BLACK,
  },
  // —— 页眉橙色横条 ——
  headerBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: ORANGE,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 20,
  },
  headerCompany: {
    fontSize: 13,
    fontWeight: 'bold',
  },
  headerInvoice: {
    fontSize: 30,
    fontFamily: FONT,
    fontStyle: 'italic',
    fontWeight: 'bold',
    color: BLUE,
  },
  // —— 公司信息 + 单据信息 ——
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 22,
  },
  infoLeft: {
    maxWidth: '55%',
  },
  infoLeftName: {
    fontSize: 10,
    marginBottom: 3,
  },
  infoLeftLine: {
    fontSize: 10,
    lineHeight: 1.4,
  },
  infoRight: {
    width: 250,
  },
  metaRow: {
    flexDirection: 'row',
    marginBottom: 3,
  },
  metaLabel: {
    width: 95,
    textAlign: 'right',
    fontWeight: 'bold',
    fontSize: 10,
  },
  metaValue: {
    marginLeft: 10,
    flex: 1,
    textAlign: 'left',
    fontSize: 10,
  },
  // —— TO ——
  toLine: {
    fontSize: 11,
    marginBottom: 18,
  },
  toLabel: {
    fontWeight: 'bold',
  },
  // —— PICKUPS / DROPS 黑框 ——
  pdBox: {
    borderWidth: 2,
    borderColor: BLACK,
    flexDirection: 'row',
    marginBottom: 18,
  },
  pdCol: {
    flex: 1,
    padding: 14,
    minHeight: 96,
  },
  pdColLeft: {
    borderRightWidth: 2,
    borderRightColor: BLACK,
  },
  pdHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  pdHeadLabel: {
    fontWeight: 'bold',
    fontSize: 11,
  },
  pdHeadDate: {
    fontSize: 10,
  },
  pdCompany: {
    fontSize: 11,
    marginBottom: 4,
  },
  pdAddress: {
    fontSize: 9.5,
    lineHeight: 1.6,
  },
  // —— 明细表 ——
  detailTable: {
    borderWidth: 1,
    borderColor: ORANGE_LINE,
  },
  detailHead: {
    flexDirection: 'row',
    backgroundColor: ORANGE_LIGHT,
    borderBottomWidth: 1,
    borderBottomColor: ORANGE_LINE,
    paddingVertical: 6,
  },
  detailHeadDesc: {
    flex: 3,
    fontSize: 10.5,
    fontWeight: 'bold',
    paddingLeft: 10,
  },
  detailHeadTotal: {
    flex: 1,
    fontSize: 10.5,
    fontWeight: 'bold',
    textAlign: 'right',
    paddingRight: 10,
    borderLeftWidth: 1,
    borderLeftColor: ORANGE_LINE,
  },
  detailRow: {
    flexDirection: 'row',
    minHeight: 24,
    borderBottomWidth: 1,
    borderBottomColor: ORANGE_LINE,
  },
  detailRowLast: {
    flexDirection: 'row',
    minHeight: 24,
  },
  detailDesc: {
    flex: 3,
    fontSize: 10,
    paddingVertical: 5,
    paddingLeft: 10,
  },
  detailTotal: {
    flex: 1,
    fontSize: 10,
    paddingVertical: 5,
    paddingRight: 10,
    textAlign: 'right',
    borderLeftWidth: 1,
    borderLeftColor: ORANGE_LINE,
  },
  // —— TOTAL DUE ——
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: 26,
  },
  totalLabel: {
    fontSize: 13,
    fontWeight: 'bold',
    marginRight: 12,
  },
  totalValueBox: {
    backgroundColor: ORANGE,
    paddingVertical: 7,
    paddingHorizontal: 18,
  },
  totalValue: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  // —— 页脚（随内容流式） ——
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: 50,
  },
  footerHead: {
    fontSize: 8.5,
    fontWeight: 'bold',
    marginBottom: 3,
  },
  footerCompany: {
    fontSize: 9,
    marginBottom: 2,
  },
  footerLine: {
    fontSize: 9,
    lineHeight: 1.35,
  },
  footerThanks: {
    fontSize: 10,
    fontWeight: 'bold',
  },
})

export function AccountingInvoiceAaDocument({ data }: { data: AccountingInvoicePdfPayload }) {
  const blankRows = Math.max(0, DETAIL_TOTAL_ROWS - data.lines.length)

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* 页眉橙色横条 */}
        <View style={styles.headerBar}>
          <Text style={styles.headerCompany}>{AA_PDF_COMPANY_NAME}</Text>
          <Text style={styles.headerInvoice}>INVOICE</Text>
        </View>

        {/* 公司信息（左） + INVOICE NO./DATE/Load no.（右） */}
        <View style={styles.infoRow}>
          <View style={styles.infoLeft}>
            <Text style={styles.infoLeftName}>{AA_PDF_COMPANY_NAME}</Text>
            {AA_PDF_ADDRESS_LINES.map((line) => (
              <Text key={line} style={styles.infoLeftLine}>
                {line}
              </Text>
            ))}
          </View>
          <View style={styles.infoRight}>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>INVOICE NO.</Text>
              <Text style={styles.metaValue}>{data.invoiceNumber}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>DATE</Text>
              <Text style={styles.metaValue}>{data.invoiceDate}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Load no.</Text>
              <Text style={styles.metaValue}>{data.loadNumber}</Text>
            </View>
          </View>
        </View>

        {/* TO */}
        <Text style={styles.toLine}>
          <Text style={styles.toLabel}>TO </Text>
          {data.billTo}
        </Text>

        {/* PICKUPS | DROPS 黑框 */}
        <View style={styles.pdBox}>
          <View style={[styles.pdCol, styles.pdColLeft]}>
            <View style={styles.pdHead}>
              <Text style={styles.pdHeadLabel}>PICKUPS</Text>
              <Text style={styles.pdHeadDate}>{data.pickupDate}</Text>
            </View>
            <Text style={styles.pdCompany}>{data.pickupCompany}</Text>
            <Text style={styles.pdAddress}>{data.pickupAddress}</Text>
          </View>
          <View style={styles.pdCol}>
            <View style={styles.pdHead}>
              <Text style={styles.pdHeadLabel}>DROPS</Text>
              <Text style={styles.pdHeadDate}>{data.dropDate}</Text>
            </View>
            <Text style={styles.pdCompany}>{data.dropCompany}</Text>
            <Text style={styles.pdAddress}>{data.dropAddress}</Text>
          </View>
        </View>

        {/* 明细表：数据行 + 补足空白行 */}
        <View style={styles.detailTable}>
          <View style={styles.detailHead}>
            <Text style={styles.detailHeadDesc}>DESCRIPTION</Text>
            <Text style={styles.detailHeadTotal}>TOTAL</Text>
          </View>
          {data.lines.map((line, i) => (
            <View key={i} style={styles.detailRow}>
              <Text style={styles.detailDesc}>{line.description}</Text>
              <Text style={styles.detailTotal}>{line.amount}</Text>
            </View>
          ))}
          {Array.from({ length: blankRows }).map((_, i) => (
            <View
              key={`blank-${i}`}
              style={i === blankRows - 1 ? styles.detailRowLast : styles.detailRow}
            />
          ))}
        </View>

        {/* TOTAL DUE */}
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>TOTAL DUE</Text>
          <View style={styles.totalValueBox}>
            <Text style={styles.totalValue}>{data.invoicePrice}</Text>
          </View>
        </View>

        {/* 页脚 */}
        <View style={styles.footer}>
          <View>
            <Text style={styles.footerHead}>DIRECT ALL INQUIRIES TO:</Text>
            <Text style={styles.footerCompany}>{AA_PDF_COMPANY_NAME}</Text>
            <Text style={styles.footerLine}>PHONE: {AA_PDF_PHONE}</Text>
            <Text style={styles.footerLine}>EMAIL: {AA_PDF_EMAIL}</Text>
          </View>
          <Text style={styles.footerThanks}>THANK YOU FOR YOUR BUSINESS!</Text>
        </View>
      </Page>
    </Document>
  )
}
