import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { NativeExcelError } from '@/lib/templates/native-excel'

const execFileAsync = promisify(execFile)
let active = 0
const waiting: Array<() => void> = []
async function acquire() {
  if (active < 2) { active++; return }
  await new Promise<void>(resolve => waiting.push(resolve))
}
function release() {
  const next = waiting.shift()
  if (next) next()
  else active--
}
/** No legacy-renderer fallback: an unavailable engine must not silently change the invoice. */
export async function nativeExcelToPdf(workbook: Buffer): Promise<Buffer> {
  await acquire()
  let dir: string | undefined
  try {
    dir = await mkdtemp(join(tmpdir(), 'invoice-excel-'))
    await writeFile(join(dir, 'invoice.xlsx'), workbook)
    await execFileAsync(process.env.LIBREOFFICE_PATH || 'soffice', [
      `-env:UserInstallation=${pathToFileURL(join(dir, 'profile')).href}`,
      '--headless', '--convert-to', 'pdf:calc_pdf_Export', '--outdir', dir, join(dir, 'invoice.xlsx'),
    ], { timeout: 60000, maxBuffer: 1024 * 1024 })
    const pdf = await readFile(join(dir, 'invoice.pdf'))
    if (pdf.subarray(0, 5).toString() !== '%PDF-') throw new Error('invalid PDF')
    return pdf
  } catch (cause) {
    throw new NativeExcelError('Excel 转 PDF 失败。服务器需要安装 LibreOffice 和模板字体，并配置 LIBREOFFICE_PATH；可以先下载填好数据的 Excel。', { cause })
  } finally {
    try { if (dir) await rm(dir, { recursive: true, force: true }) } finally { release() }
  }
}
