import { autoFitRowHeights } from './auto-fit-row-heights'
import type { TemplateCell, TemplateCellStyle, TemplateGrid, TemplatePageConfig } from './types'

export const AA_COLD_CHAIN_PAGE_CONFIG: TemplatePageConfig = {
  size: 'A4',
  margin: { top: 24, right: 24, bottom: 24, left: 24 },
  fontFamily: 'Noto Sans SC',
  baseFontSize: 10,
  textColor: '#000000',
}

export interface AaColdChainRenderData {
  invoiceNumber: string
  invoiceDate: string
  loadNumber: string
  billTo: string
  total: string
  lines: Array<{
    serviceDate: string
    pickupAddress: string
    dropAddress1: string
    dropAddress2: string
    dropAddress3: string
    amount: string
  }>
}

const ORANGE = '#F79646'
const HEADER_ORANGE = '#F89D55'
const LIGHT_ORANGE = '#FDEFE9'
const COL_WIDTHS = [63.8, 105, 101.3, 109.5, 91.5, 144.8]
const DATA_START_ROW = 15
const DESIGNED_DATA_ROWS = 17

function cell(
  row: number,
  col: number,
  text = '',
  style: TemplateCellStyle = {},
  colSpan = 1,
): TemplateCell {
  return { row, col, rowSpan: 1, colSpan, text, style }
}

function tableBorders(col: number): TemplateCellStyle['borders'] {
  return {
    bottom: 2,
    ...(col === 0 ? { left: 2 } : {}),
    ...(col === 5 ? { right: 2 } : {}),
    color: ORANGE,
    styles: {
      bottom: 'medium',
      ...(col === 0 ? { left: 'medium' as const } : {}),
      ...(col === 5 ? { right: 'medium' as const } : {}),
    },
  }
}

export function buildAaColdChainGrid(data: AaColdChainRenderData): TemplateGrid {
  const dataRows = Math.max(DESIGNED_DATA_ROWS, data.lines.length)
  const separatorRow = DATA_START_ROW + dataRows
  const totalRow = separatorRow + 1
  const footerRow = totalRow + 2
  const rowHeights = [
    15, 44.25, 15, 15, 21, 18, 20, 15, 18, 15, 15, 15, 14.25, 14.25, 14.25,
    ...Array.from({ length: dataRows }, () => 18),
    15, 26.25, 15, 15, 25.5, 15, 15,
  ]
  const cells: TemplateCell[] = []

  for (let col = 0; col < 6; col += 1) {
    cells.push(cell(1, col, col === 0 ? 'ALREADY ARRIVED LOGISTICS INC' : col === 5 ? 'INVOICE' : '', {
      fill: HEADER_ORANGE,
      fontSize: col === 0 ? 16 : col === 5 ? 36 : 10,
      color: col === 5 ? '#003366' : '#000000',
      valign: 'middle',
    }))
  }
  cells.push(cell(3, 0, 'ALREADY ARRIVED LOGISTICS INC', { fontSize: 10 }))
  cells.push(cell(4, 0, '4011 Berdina Rd', { fontSize: 10 }))
  cells.push(cell(5, 0, 'Castro Valley CA 94546', { fontSize: 10 }))
  cells.push(cell(4, 3, 'INVOICE NO.', { bold: true, fontSize: 14, color: '#333333', halign: 'right' }))
  cells.push(cell(4, 5, data.invoiceNumber, { fontSize: 10, halign: 'right', wrap: true }))
  cells.push(cell(5, 3, 'DATE', { bold: true, fontSize: 14, color: '#333333', halign: 'right' }))
  cells.push(cell(5, 5, data.invoiceDate, { fontSize: 10, halign: 'right', wrap: true }))
  cells.push(cell(6, 3, 'Load no.', { bold: true, fontSize: 14, color: '#333333', halign: 'right' }))
  cells.push(cell(6, 5, data.loadNumber, { fontSize: 10, halign: 'right', wrap: true }))
  cells.push(cell(8, 0, 'TO', { bold: true, fontSize: 14, color: '#333333' }))
  cells.push(cell(9, 0, data.billTo, { fontSize: 11, wrap: true }, 3))

  for (let col = 0; col < 6; col += 1) {
    cells.push(cell(12, col, '', { borders: { bottom: 2, color: ORANGE, styles: { bottom: 'medium' } } }))
    cells.push(cell(13, col, '', { fill: HEADER_ORANGE }))
  }
  const headers = ['DATE', 'PU', 'DEL 1', 'DEL 2', 'DEL 3', 'RATE']
  headers.forEach((text, col) => cells.push(cell(14, col, text, {
    bold: true,
    fontSize: 10,
    fill: LIGHT_ORANGE,
    borders: tableBorders(col),
    halign: col === 5 ? 'right' : col === 0 ? 'center' : 'left',
    valign: 'middle',
  })))

  for (let index = 0; index < dataRows; index += 1) {
    const line = data.lines[index]
    const values = line
      ? [line.serviceDate, line.pickupAddress, line.dropAddress1, line.dropAddress2, line.dropAddress3, line.amount]
      : ['', '', '', '', '', '']
    values.forEach((text, col) => cells.push(cell(DATA_START_ROW + index, col, text, {
      fontSize: 9,
      fill: '#FFFFFF',
      borders: tableBorders(col),
      halign: col === 0 ? 'center' : col === 5 ? 'right' : 'left',
      valign: 'middle',
      wrap: true,
    })))
  }

  cells.push(cell(separatorRow, 0, '', {
    fill: LIGHT_ORANGE,
    borders: { bottom: 2, left: 2, color: ORANGE, styles: { bottom: 'medium', left: 'medium' } },
  }, 4))
  cells.push(cell(separatorRow, 4, '', { fill: LIGHT_ORANGE, borders: { bottom: 2, color: ORANGE, styles: { bottom: 'medium' } } }))
  cells.push(cell(separatorRow, 5, '', {
    fill: LIGHT_ORANGE,
    borders: { right: 2, bottom: 2, color: ORANGE, styles: { right: 'medium', bottom: 'medium' } },
  }))
  cells.push(cell(totalRow, 3, 'TOTAL DUE', { bold: true, color: '#333333', halign: 'right', valign: 'middle' }, 2))
  cells.push(cell(totalRow, 5, data.total, {
    bold: true,
    fill: ORANGE,
    halign: 'right',
    valign: 'middle',
    borders: { right: 2, bottom: 2, color: ORANGE, styles: { right: 'medium', bottom: 'medium' } },
  }))
  cells.push(cell(footerRow, 0, 'DIRECT ALL INQUIRIES TO:', { bold: true }))
  cells.push(cell(footerRow + 1, 0, 'ALREADY ARRIVED LOGISTICS INC', {}, 2))
  cells.push(cell(footerRow + 2, 0, 'PHONE: 510-330-9581'))
  cells.push(cell(footerRow + 3, 0, 'EMAIL: Alreadyarrivedlogistics@gmail.com'))
  cells.push(cell(footerRow + 3, 3, 'THANK YOU FOR YOUR BUSINESS!', { bold: true }, 3))

  const grid = { colWidths: COL_WIDTHS, rowHeights, cells }
  const dynamicCoords = new Set(
    cells.filter((entry) => entry.style.wrap && entry.text).map((entry) => `${entry.row}:${entry.col}`)
  )
  return autoFitRowHeights(grid, dynamicCoords)
}

export function sampleAaColdChainRenderData(): AaColdChainRenderData {
  return {
    invoiceNumber: 'AA092026001',
    invoiceDate: '09/11/2026',
    loadNumber: 'CL-001',
    billTo: 'WELCOME MARKET INC',
    total: '$1,250.00',
    lines: [
      {
        serviceDate: '09/10/2026',
        pickupAddress: 'Oakland, CA',
        dropAddress1: 'San Jose, CA',
        dropAddress2: 'Fremont, CA',
        dropAddress3: '',
        amount: '$1,250.00',
      },
    ],
  }
}
