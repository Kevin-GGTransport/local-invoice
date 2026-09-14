/** Read-only inputs, local disposable PDF QA. No database or conversion subprocess. */
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import { parseTemplateXlsx } from '../src/lib/templates/parse-xlsx'
import { calibrateInvoiceReference } from '../src/lib/templates/invoice-reference-layout'
import { deriveBindingFromGrid } from '../src/lib/templates/token-binding'
import { validateTemplateGrid } from '../src/lib/templates/template-grid'
import { renderTemplateData, sampleTemplateRenderData } from '../src/lib/templates/render-template-data'
import { GenericTemplateDocument } from '../src/lib/services/print/generic-template-pdf'
import { PDFDocument } from 'pdf-lib'

async function main() {
  const output = await fs.mkdtemp(path.join(os.tmpdir(), 'web-excel-qa-'))
  for (const input of process.argv.slice(2)) {
    const preset = path.basename(input).toLowerCase().startsWith('yg') ? 'yg' : 'aa'
    const parsed = calibrateInvoiceReference(await parseTemplateXlsx(await fs.readFile(input)), preset)
    const derived = deriveBindingFromGrid(parsed.grid)
    const errors = [...derived.errors, ...validateTemplateGrid(parsed.grid, derived.binding)]
    if (errors.length) throw new Error(errors.join('; '))
    const data = sampleTemplateRenderData()
    data.invoiceNumber = preset === 'yg' ? 'YG092026001' : 'AA092026040'
    data.invoiceDate = '09/10/2026'
    data.billTo = preset === 'yg' ? 'Polaris' : 'WorldWide'
    data.pickupCompany = 'FUSION WAREHOUSE'; data.dropCompany = 'VESTCOM CYPRESS'
    data.pickupAddress = '16774 JURUPA AVE\nFONTANA,CA 92337'
    data.dropAddress = '6300 KATELLA AVENUE\nCYPRESS,CA 90630'
    data.loadNumber = '1244433'
    data.total = preset === 'yg' ? '$2,900.00' : '$399.00'
    data.lines = [{ description: preset === 'yg' ? 'Load# 0356164' : 'Carrier Charge', amount: data.total, quantity: '1', unitPrice: data.total }]
    const grid = renderTemplateData(parsed.grid, derived.binding, data)
    const bytes = await renderToBuffer(<GenericTemplateDocument pageConfig={parsed.pageConfig} grid={grid} />)
    const pdf = await PDFDocument.load(bytes)
    if (pdf.getPageCount() !== 1) throw new Error(`${preset}: expected one page`)
    const filename = path.join(output, `${preset}-web.pdf`)
    await fs.writeFile(filename, bytes)
    console.log(JSON.stringify({ filename, pages: pdf.getPageCount(), capacity: derived.binding.lineItems?.minRows, rows: grid.rowHeights.length, errors }))
  }
}
main().catch(err => { console.error(err); process.exitCode = 1 })
