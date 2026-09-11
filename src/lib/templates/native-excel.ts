import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import { createHash } from 'node:crypto'
import { posix } from 'node:path'
import { z } from 'zod'
import { columnName, type NativeExcelGrid } from './native-excel-types'
import { deriveBindingFromGrid, FIELD_TOKENS, DETAIL_TOKENS, containsFieldToken, replaceFieldToken } from './token-binding'
import { TEMPLATE_FIELDS, type TemplateBinding, type TemplateRenderData } from './types'

const point = z.object({ row: z.number().int().min(0).max(999), col: z.number().int().min(0).max(99) })
const field = z.object({ cells: z.array(point).min(1).max(20), format: z.enum(['text', 'date', 'money', 'number']) })
export const nativeBindingSchema = z.object({
  fields: z.object({ invoice_number: field.optional(), invoice_date: field.optional(), load_number: field.optional(), bill_to: field.optional(), total: field.optional(), pickup_date: field.optional(), pickup_company: field.optional(), pickup_address: field.optional(), drop_date: field.optional(), drop_company: field.optional(), drop_address: field.optional() }),
  lineItems: z.object({ startRow: z.number().int().min(0).max(999), endRow: z.number().int().min(0).max(999), minRows: z.number().int().min(1).max(1000), columns: z.object({ description: z.number().int().min(0).max(99).optional(), amount: z.number().int().min(0).max(99).optional(), quantity: z.number().int().min(0).max(99).optional(), unitPrice: z.number().int().min(0).max(99).optional() }) }).nullable(),
})
const valueKeys = { invoice_number: 'invoiceNumber', invoice_date: 'invoiceDate', load_number: 'loadNumber', bill_to: 'billTo', total: 'total', pickup_date: 'pickupDate', pickup_company: 'pickupCompany', pickup_address: 'pickupAddress', drop_date: 'dropDate', drop_company: 'dropCompany', drop_address: 'dropAddress' } as const

export class NativeExcelError extends Error {}
/** ExcelJS cannot read some valid namespace-prefixed exports. Normalize a disposable
 * metadata copy only; source storage and emitted OOXML always use the original bytes. */
async function readWorkbook(bytes: Buffer): Promise<ExcelJS.Workbook> {
  const zip = await JSZip.loadAsync(bytes)
  let changed = false
  for (const path of Object.keys(zip.files)) {
    if (!path.startsWith('xl/') || !path.endsWith('.xml')) continue
    let xml = await zip.file(path)!.async('string')
    const prefixes = [...xml.matchAll(/xmlns:([\w]+)=["']http:\/\/schemas\.openxmlformats\.org\/spreadsheetml\/2006\/main["']/g)]
    if (!prefixes.length) continue
    for (const match of prefixes) {
      xml = xml.replace(new RegExp(`(<\\/?)${match[1]}:`, 'g'), '$1')
      xml = xml.replace(match[0], xml.includes('xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"') ? '' : 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"')
    }
    zip.file(path, xml); changed = true
  }
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load((changed ? await zip.generateAsync({ type: 'nodebuffer' }) : bytes) as unknown as ArrayBuffer)
  return wb
}
export function nativeSourceBytes(grid: NativeExcelGrid): Buffer {
  const bytes = Buffer.from(grid.nativeExcel.base64, 'base64')
  if (createHash('sha256').update(bytes).digest('hex') !== grid.nativeExcel.sha256) throw new NativeExcelError('Excel 原文件校验失败，请重新上传为新模板')
  return bytes
}

export async function importNativeExcel(bytes: Buffer, filename: string) {
  const archive = await JSZip.loadAsync(bytes)
  if (Object.keys(archive.files).some(path => /vbaProject\.bin$|^xl\/externalLinks\//i.test(path))) {
    throw new NativeExcelError('请先将模板另存为不含宏和外部工作簿链接的 .xlsx 文件')
  }
  const wb = await readWorkbook(bytes)
  const ws = wb.worksheets[0]
  if (!ws) throw new NativeExcelError('Excel 中没有工作表')
  // Metadata only: never use these cells or their styles to draw the workbook.
  const cells: NativeExcelGrid['cells'] = []
  let maxRow = 0, maxCol = 0
  ws.eachRow(row => row.eachCell(cell => {
    if (cell.isMerged && cell.master.address !== cell.address) return
    if (!cell.text) return
    const r = Number(cell.row) - 1, c = Number(cell.col) - 1
    if (r > 999 || c > 99) throw new NativeExcelError('原件模式目前支持前 1000 行、100 列，请缩小模板范围')
    maxRow = Math.max(maxRow, r); maxCol = Math.max(maxCol, c)
    cells.push({ row: r, col: c, rowSpan: 1, colSpan: 1, text: cell.text, style: {} })
  }))
  if (!cells.length) throw new NativeExcelError('第一张工作表没有内容')
  const grid: NativeExcelGrid = { cells, rowHeights: Array(maxRow + 1).fill(15), colWidths: Array(maxCol + 1).fill(48), nativeExcel: { version: 1, filename, base64: bytes.toString('base64'), sha256: createHash('sha256').update(bytes).digest('hex'), sheetName: ws.name } }
  const derived = deriveBindingFromGrid(grid)
  return { grid, binding: derived.binding, warnings: [...derived.errors, ...derived.unknownTokens.map(t => `未知变量：{{${t}}}`)] }
}

export async function validateNativeBinding(grid: NativeExcelGrid, binding: TemplateBinding, publishing = false) {
  const checked = nativeBindingSchema.safeParse(binding)
  if (!checked.success) throw new NativeExcelError('变量绑定格式或单元格地址无效')
  const errors: string[] = []
  if (publishing && !binding.lineItems) errors.push('发布前请配置明细预留区域')
  if (binding.lineItems) {
    const li = binding.lineItems
    if (li.endRow < li.startRow) errors.push('明细结束行不能小于起始行')
    if (li.columns.description == null || li.columns.amount == null) errors.push('明细必须绑定描述列和金额列')
    const cols = Object.values(li.columns).filter(c => c != null)
    if (new Set(cols).size !== cols.length) errors.push('明细列不能重复绑定')
  }
  const wb = await readWorkbook(nativeSourceBytes(grid))
  const ws = wb.worksheets[0]
  const seen = new Set<string>()
  const check = (r: number, c: number, detail = false) => {
    const address = `${columnName(c)}${r + 1}`
    const cell = ws.getCell(address)
    if (cell.isMerged && cell.master.address !== address) errors.push(`${address} 是合并区域内部，请绑定左上角 ${cell.master.address}`)
    if (seen.has(address)) errors.push(`${address} 重复绑定`)
    seen.add(address)
    if (detail && cell.formula) errors.push(`${address} 有公式，请将明细绑定到可填入的空白行`)
  }
  for (const f of Object.values(binding.fields)) for (const p of f?.cells ?? []) check(p.row, p.col)
  if (binding.lineItems) {
    const li = binding.lineItems
    if (li.minRows !== li.endRow - li.startRow + 1) errors.push('明细容量必须等于结束行减起始行加一')
    for (let r = li.startRow; r <= li.endRow; r++) for (const c of Object.values(li.columns)) if (c != null) check(r, c, true)
  }
  if (errors.length) throw new NativeExcelError([...new Set(errors)].join('；'))
}

const escapeXml = (s: string) => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/\r/g, '&#13;')
function attr(xml: string, key: string) { return new RegExp(`\\b${key}=["']([^"']*)["']`).exec(xml)?.[1] }
function tokenPattern(token: string): RegExp {
  const inner = token.slice(2, -2).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`\\{\\{\\s*${inner}\\s*\\}\\}`, 'g')
}
type CellEdit = { value: string; numeric: boolean; token?: string; replacement: string }
const unescapeXml = (text: string) => text.replace(/&#x([\da-f]+);|&#(\d+);|&(amp|lt|gt|quot|apos);/gi, (_, hex, dec, named) => hex ? String.fromCodePoint(parseInt(hex,16)) : dec ? String.fromCodePoint(Number(dec)) : ({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"} as Record<string,string>)[named])

/** Preserve each original rich-text run's properties, even when a token spans runs. */
function replaceRichText(body: string, edit: CellEdit, prefix: string): string | null {
  const runs = body.match(/<(?:\w+:)?r\b[^>]*>[\s\S]*?<\/(?:\w+:)?r>/g)
  if (!runs?.length) return null
  const texts = runs.map(run => unescapeXml(run.match(/<(?:\w+:)?t\b[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/)?.[1] ?? ''))
  const original = texts.join('')
  const matches = edit.token ? [...original.matchAll(tokenPattern(edit.token))] : []
  const changes = matches.length ? matches.map(m => ({start:m.index!, end:m.index!+m[0].length, value:edit.replacement})) : [{start:0,end:original.length,value:edit.value}]
  let offset = 0
  const result = runs.map((run,index) => {
    const start = offset, end = start+texts[index].length
    offset=end
    let cursor=start, text=''
    for (const change of changes) {
      if (change.end<=start || change.start>=end) continue
      text += original.slice(cursor, Math.max(start,change.start))
      if (change.start>=start) text += change.value
      cursor=Math.min(end,change.end)
    }
    text += original.slice(cursor,end)
    if (!original && index===0) text=edit.value
    return run.replace(/<(?:\w+:)?t\b[^>]*>[\s\S]*?<\/(?:\w+:)?t>/, `<t xml:space="preserve">${escapeXml(text)}</t>`)
  }).join('')
  return result.replace(/(<\/?)(?:\w+:)?([A-Za-z]\w*)(?=[\s/>])/g, `$1${prefix}$2`)
}

export function nativeSampleData(binding: TemplateBinding, sample: TemplateRenderData): TemplateRenderData {
  const lines = sample.lines.slice(0, binding.lineItems?.minRows ?? 0)
  const total = binding.lineItems ? `$${lines.reduce((sum, line) => sum + Number(line.amount.replace(/[$,]/g, '')), 0).toLocaleString('en-US', {minimumFractionDigits:2,maximumFractionDigits:2})}` : sample.total
  return { ...sample, lines, total }
}

/** Change only bound cell values inside the original OOXML zip. All other parts stay byte-identical. */
export async function fillNativeExcel(grid: NativeExcelGrid, binding: TemplateBinding, data: TemplateRenderData): Promise<Buffer> {
  await validateNativeBinding(grid, binding)
  const bytes = nativeSourceBytes(grid)
  const wb = await readWorkbook(bytes)
  const ws = wb.worksheets[0]
  const edits = new Map<string, CellEdit>()
  const put = (row: number, col: number, value: string, number = false, token?: string, replacement=value) => {
    const address = `${columnName(col)}${row + 1}`
    const cell = ws.getCell(address)
    // Numeric values keep the existing Excel number format and remain usable by formulas.
    const rich = typeof cell.value === 'object' && cell.value != null && 'richText' in cell.value
    const numeric = !rich && number && value !== '' && Number.isFinite(Number(value.replace(/[$,]/g, '')))
    edits.set(address, { value: numeric ? String(Number(value.replace(/[$,]/g, ''))) : value, numeric, token, replacement })
    return cell
  }
  for (const f of TEMPLATE_FIELDS) {
    for (const p of binding.fields[f.key]?.cells ?? []) {
      const value = data[valueKeys[f.key]]
      const original = ws.getCell(p.row + 1, p.col + 1).text
      const hasToken = containsFieldToken(original, f.key)
      const text = hasToken ? replaceFieldToken(original, f.key, value) : value
      const onlyToken = original.trim().match(tokenPattern(FIELD_TOKENS[f.key]))?.[0] === original.trim()
      const cell = put(p.row, p.col, text, f.format === 'money' && (!hasToken || onlyToken), hasToken ? FIELD_TOKENS[f.key] : undefined, value)
      const rich = typeof cell.value === 'object' && cell.value != null && 'richText' in cell.value
      if (!rich && f.format === 'date' && (!hasToken || onlyToken) && /[dmy]/i.test((cell.numFmt || '').replace(/"[^"]*"|\[[^\]]*\]/g,''))) {
        const date = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value)
        if (date) {
          const time = Date.UTC(Number(date[3]),Number(date[1])-1,Number(date[2]))
          const epoch = wb.properties.date1904 ? Date.UTC(1904,0,1) : Date.UTC(1899,11,30)
          let serial = (time-epoch)/86400000
          if (!wb.properties.date1904 && time<Date.UTC(1900,2,1)) serial--
          edits.set(cell.address,{value:String(serial),numeric:true,replacement:value})
        }
      }
    }
  }
  const li = binding.lineItems
  if (li) {
    if (data.lines.length > li.minRows) throw new NativeExcelError(`本模板预留 ${li.minRows} 行，账单有 ${data.lines.length} 行。请增加 Excel 预留行并上传新版本，原版式未被修改。`)
    for (let row = li.startRow; row <= li.endRow; row++) {
      const line = data.lines[row - li.startRow]
      for (const role of ['description', 'quantity', 'unitPrice', 'amount'] as const) {
        const col = li.columns[role]
        if (col != null) {
          const original = ws.getCell(row+1,col+1).text
          const token = DETAIL_TOKENS[role]
          const hasToken = tokenPattern(token).test(original)
          const replacement = line?.[role] ?? ''
          const value = hasToken && line ? original.replace(tokenPattern(token),()=>replacement) : replacement
          const standalone = !hasToken || original.trim().match(tokenPattern(token))?.[0]===original.trim()
          put(row, col, value, role !== 'description' && standalone, hasToken && line ? token : undefined, replacement)
        }
      }
    }
  }
  const zip = await JSZip.loadAsync(bytes)
  const workbookXml = await zip.file('xl/workbook.xml')!.async('string')
  const rels = await zip.file('xl/_rels/workbook.xml.rels')!.async('string')
  const firstSheet = workbookXml.match(/<(?:\w+:)?sheet\s[^>]*>/)?.[0] ?? ''
  const id = attr(firstSheet, 'r:id')
  const rel = (rels.match(/<(?:\w+:)?Relationship\s[^>]*>/g) ?? []).find(r => attr(r, 'Id') === id)
  const target = rel && attr(rel, 'Target')
  if (!target) throw new NativeExcelError('无法定位 Excel 工作表文件')
  const path = target.startsWith('/') ? target.slice(1) : posix.normalize(posix.join('xl', target))
  const sheetFile = zip.file(path)
  if (!sheetFile) throw new NativeExcelError('Excel 工作表文件缺失')
  let xml = await sheetFile.async('string')
  const prefix = xml.match(/<(\w+:)?worksheet\b/)?.[1] ?? ''
  const sharedXml = await zip.file('xl/sharedStrings.xml')?.async('string') ?? ''
  const shared = sharedXml.match(/<(?:\w+:)?si\b[^>]*>[\s\S]*?<\/(?:\w+:)?si>/g) ?? []
  const cellXml = (address: string, edit: CellEdit, tag?: string, whole?: string) => {
    const attrs = tag ? tag.replace(/^<[^\s>]+/, '').replace(/\/?\s*>$/, '').replace(/\s+t=["'][^"']*["']/g, '') : ` r="${address}"`
    const richSource = tag && attr(tag,'t')==='s' ? shared[Number(whole?.match(/<(?:\w+:)?v>(\d+)<\/(?:\w+:)?v>/)?.[1])] : whole
    const rich = !edit.numeric && richSource ? replaceRichText(richSource,edit,prefix) : null
    if (rich) return `<${prefix}c${attrs} t="inlineStr"><${prefix}is>${rich}</${prefix}is></${prefix}c>`
    return edit.numeric ? `<${prefix}c${attrs}><${prefix}v>${edit.value}</${prefix}v></${prefix}c>` : `<${prefix}c${attrs} t="inlineStr"><${prefix}is><${prefix}t xml:space="preserve">${escapeXml(edit.value)}</${prefix}t></${prefix}is></${prefix}c>`
  }
  xml = xml.replace(/<(?:\w+:)?c\b[^>]*?(?:\/>|>[\s\S]*?<\/(?:\w+:)?c>)/g, (whole) => {
    const tag = whole.match(/^<[^>]+>/)![0]
    const address = attr(tag, 'r')
    const edit = address && edits.get(address)
    if (!address || !edit) return whole
    edits.delete(address)
    return cellXml(address, edit, tag, whole)
  })
  // Explicit bindings may point to cells that Excel omitted because they were empty.
  for (const [address, edit] of edits) {
    const row = Number(address.match(/\d+$/)![0])
    let inserted = false
    xml = xml.replace(/<(?:\w+:)?row\b[^>]*(?:\/>|>[\s\S]*?<\/(?:\w+:)?row>)/g, whole => {
      const tag = whole.match(/^<[^>]+>/)![0]
      if (Number(attr(tag, 'r')) !== row) return whole
      inserted = true
      const body = whole.endsWith('/>') ? tag.replace(/\/>$/, '>') + `</${prefix}row>` : whole
      const colIndex = (a: string) => a.replace(/\d/g, '').split('').reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0)
      let placed = false
      const sorted = body.replace(/<(?:\w+:)?c\b[^>]*>/g, tag2 => {
        if (!placed && colIndex(attr(tag2, 'r') ?? 'A1') > colIndex(address)) { placed = true; return cellXml(address, edit) + tag2 }
        return tag2
      })
      return placed ? sorted : sorted.replace(new RegExp(`</${prefix}row>$`), cellXml(address, edit) + `</${prefix}row>`)
    })
    if (!inserted) {
      const newRow = `<${prefix}row r="${row}">${cellXml(address, edit)}</${prefix}row>`
      let placed = false
      xml = xml.replace(/<(?:\w+:)?row\b[^>]*>/g, tag => {
        if (!placed && Number(attr(tag, 'r')) > row) { placed = true; return newRow + tag }
        return tag
      })
      if (!placed) xml = xml.replace(`</${prefix}sheetData>`, newRow + `</${prefix}sheetData>`)
    }
  }
  zip.file(path, xml)
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
}
