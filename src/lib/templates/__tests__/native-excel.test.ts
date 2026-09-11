import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import { importNativeExcel, fillNativeExcel, nativeSourceBytes, validateNativeBinding, nativeSampleData } from '../native-excel'
import { isNativeExcelGrid } from '../native-excel-types'
import { sampleTemplateRenderData } from '../render-template-data'

async function fixture() {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Invoice')
  ws.getCell('A1').value = 'Invoice: {{发票号}}'
  ws.getCell('A2').value = '{{收款方}}'
  ws.mergeCells('A4:C4'); ws.mergeCells('A5:C5')
  ws.getCell('A4').value = '{{描述}}'
  ws.getCell('D4').value = '{{金额}}'
  ws.getCell('D4').numFmt = '"$"#,##0.00'
  ws.getCell('D5').numFmt = '"$"#,##0.00'
  ws.getCell('A6').value = 'Total'
  ws.getCell('D6').value = { formula: 'SUM(D4:D5)', result: 0 }
  ws.getCell('D6').numFmt = '"$"#,##0.00'
  ws.getCell('A4').border = { right: { style: 'double', color: {argb:'FF123456'} }, bottom: {style:'thin'} }
  ws.getCell('A4').fill = { type: 'pattern', pattern: 'solid', fgColor: {argb:'FFFF9933'} }
  ws.getRow(4).height = 31
  ws.getColumn('A').width = 29
  ws.views = [{showGridLines:false}]
  const image = wb.addImage({base64:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJ1sAAAAASUVORK5CYII=',extension:'png'})
  ws.addImage(image, {tl:{col:5,row:0},ext:{width:12,height:12}})
  ws.pageSetup = {printArea:'A1:D6', paperSize:9, orientation:'landscape', fitToPage:true, fitToWidth:1, fitToHeight:1}
  wb.addWorksheet('Other').getCell('A1').value = 'unchanged'
  const bytes = Buffer.from(await wb.xlsx.writeBuffer())
  const native = await importNativeExcel(bytes,'reference.xlsx')
  return {bytes, ...native}
}

describe('native Excel template', () => {
  it('retains the exact source; missing marker preserves legacy mode', async () => {
    const f = await fixture()
    assert.deepEqual(nativeSourceBytes(f.grid), f.bytes)
    assert.equal(isNativeExcelGrid({cells:[],colWidths:[],rowHeights:[]}),false)
    assert.equal(isNativeExcelGrid(f.grid),true)
    assert.equal(f.binding.lineItems?.minRows,2)
  })
  it('only patches bound worksheet cells, keeping styles, merges, formulas, dimensions, print setup and other sheets', async () => {
    const f = await fixture()
    const data = sampleTemplateRenderData()
    data.billTo='A&B <Company> "Name"'
    data.lines=[{description:'Carrier Charge',quantity:'1',unitPrice:'$399.00',amount:'$399.00'}]
    const result = await fillNativeExcel(f.grid,f.binding,data)
    const before=await JSZip.loadAsync(f.bytes), after=await JSZip.loadAsync(result)
    for(const path of Object.keys(before.files)) {
      if(before.files[path].dir || path==='xl/worksheets/sheet1.xml')continue
      assert.deepEqual(await after.file(path)!.async('nodebuffer'),await before.file(path)!.async('nodebuffer'),path)
    }
    const wb=new ExcelJS.Workbook();await wb.xlsx.load(result as unknown as ArrayBuffer)
    const ws=wb.worksheets[0]
    assert.equal(ws.getCell('A1').text,`Invoice: ${data.invoiceNumber}`)
    assert.equal(ws.getCell('A2').text,data.billTo)
    assert.equal(ws.getCell('A4').text,'Carrier Charge')
    assert.equal(ws.getCell('D4').value,399)
    assert.equal(ws.getCell('D5').text,'')
    assert.equal(ws.getCell('D6').formula,'SUM(D4:D5)')
    assert.equal(ws.getCell('A4').border.right?.style,'double')
    assert.equal(ws.getRow(4).height,31)
    assert.equal(ws.getColumn('A').width,29)
    assert.equal(ws.pageSetup.printArea,'A1:D6')
    assert.equal(ws.pageSetup.orientation,'landscape')
    assert.deepEqual(nativeSourceBytes(f.grid),f.bytes)
  })
  it('inserts absent cells in sorted order and treats formula-like user data as literal text',async()=>{
    const f=await fixture()
    f.binding.fields.bill_to={cells:[{row:9,col:5},{row:0,col:3}],format:'text'}
    const d=sampleTemplateRenderData();d.billTo='=HYPERLINK("http://example.invalid")';d.lines=[]
    const result=await fillNativeExcel(f.grid,f.binding,d)
    const wb=new ExcelJS.Workbook();await wb.xlsx.load(result as unknown as ArrayBuffer)
    assert.equal(wb.worksheets[0].getCell('F10').text,d.billTo)
    assert.equal(wb.worksheets[0].getCell('D1').text,d.billTo)
    assert.equal(wb.worksheets[0].getCell('F10').formula,undefined)
  })
  it('rejects overflow instead of moving the footer; validates merged cells, overlapping roles and source integrity',async()=>{
    const f=await fixture(),data=sampleTemplateRenderData()
    data.lines=Array(3).fill({description:'x',quantity:'1',unitPrice:'$1',amount:'$1'})
    await assert.rejects(fillNativeExcel(f.grid,f.binding,data),/预留 2 行/)
    const bad=structuredClone(f.binding);bad.lineItems!.columns.amount=1
    await assert.rejects(validateNativeBinding(f.grid,bad),/合并区域内部/)
    const overlap=structuredClone(f.binding);overlap.lineItems!.columns.amount=0
    await assert.rejects(validateNativeBinding(f.grid,overlap),/重复/)
    const corrupt=structuredClone(f.grid);corrupt.nativeExcel.sha256='invalid'
    assert.throws(()=>nativeSourceBytes(corrupt),/校验失败/)
    assert.deepEqual(nativeSourceBytes(f.grid),f.bytes)
  })
  it('supports namespace-prefixed sheet XML without rewriting its styles or namespace',async()=>{
    const f=await fixture(),zip=await JSZip.loadAsync(f.bytes)
    let xml=await zip.file('xl/worksheets/sheet1.xml')!.async('string')
    xml=xml.replace(/(<\/?)([A-Za-z][\w]*)(?=[\s/>])/g,'$1x:$2').replace('xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"','xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"')
    zip.file('xl/worksheets/sheet1.xml',xml)
    const bytes=await zip.generateAsync({type:'nodebuffer'})
    // Keep the independently inferred bindings; metadata readers differ in prefix support.
    const grid=structuredClone(f.grid)
    grid.nativeExcel.base64=bytes.toString('base64')
    grid.nativeExcel.sha256=(await import('node:crypto')).createHash('sha256').update(bytes).digest('hex')
    const data=sampleTemplateRenderData();data.lines=[]
    const out=await fillNativeExcel(grid,f.binding,data)
    const outZip=await JSZip.loadAsync(out)
    const outXml=await outZip.file('xl/worksheets/sheet1.xml')!.async('string')
    assert.match(outXml,/<x:c/)
    assert.match(outXml,new RegExp(data.invoiceNumber))
    assert.deepEqual(await outZip.file('xl/styles.xml')!.async('nodebuffer'),await zip.file('xl/styles.xml')!.async('nodebuffer'))
  })
  it('allows a simple field beside detail cells on the same row, and rebinding replaces the previous token',async()=>{
    const f=await fixture()
    f.binding.fields.invoice_number={cells:[{row:3,col:5}],format:'text'}
    f.binding.fields.bill_to={cells:[{row:0,col:0}],format:'text'}
    await validateNativeBinding(f.grid,f.binding,true)
    const data=sampleTemplateRenderData();data.lines=[]
    const out=await fillNativeExcel(f.grid,f.binding,data)
    const wb=new ExcelJS.Workbook();await wb.xlsx.load(out as unknown as ArrayBuffer)
    assert.equal(wb.worksheets[0].getCell('F4').text,data.invoiceNumber)
    assert.equal(wb.worksheets[0].getCell('A1').text,data.billTo)
  })
  it('writes actual date serials in both date systems, preserving custom date formats',async()=>{
    for(const date1904 of [false,true]) {
      const wb=new ExcelJS.Workbook();wb.properties.date1904=date1904
      const ws=wb.addWorksheet('Invoice');ws.getCell('A1').value='{{发票日期}}';ws.getCell('A1').numFmt='dd-mmm-yyyy'
      const {grid,binding}=await importNativeExcel(Buffer.from(await wb.xlsx.writeBuffer()),'date.xlsx')
      const data=sampleTemplateRenderData()
      const out=await fillNativeExcel(grid,binding,data)
      const verify=new ExcelJS.Workbook();await verify.xlsx.load(out as unknown as ArrayBuffer)
      assert.equal(verify.worksheets[0].getCell('A1').numFmt,'dd-mmm-yyyy')
      assert.equal((verify.worksheets[0].getCell('A1').value as Date).toISOString(),'2026-08-20T00:00:00.000Z')
      assert.equal(verify.properties.date1904,date1904)
    }
  })
  it('preserves rich text run fonts, including tokens split between runs and repeated tokens',async()=>{
    const wb=new ExcelJS.Workbook(),ws=wb.addWorksheet('Invoice')
    ws.getCell('A1').value={richText:[{text:'Invoice: ',font:{bold:true}},{text:'{{发票',font:{color:{argb:'FFFF0000'}}},{text:'号}} + {{发票号}}',font:{italic:true}},{text:' end',font:{underline:true}}]}
    const {grid,binding}=await importNativeExcel(Buffer.from(await wb.xlsx.writeBuffer()),'rich.xlsx')
    const data=sampleTemplateRenderData()
    const out=await fillNativeExcel(grid,binding,data)
    const verify=new ExcelJS.Workbook();await verify.xlsx.load(out as unknown as ArrayBuffer)
    const value=verify.worksheets[0].getCell('A1').value as ExcelJS.CellRichTextValue
    assert.equal(verify.worksheets[0].getCell('A1').text,`Invoice: ${data.invoiceNumber} + ${data.invoiceNumber} end`)
    assert.equal(value.richText[0].font?.bold,true)
    assert.equal(value.richText[1].font?.color?.argb,'FFFF0000')
    assert.equal(value.richText[2].font?.italic,true)
    assert.equal(value.richText[3].font?.underline,true)
  })
  it('fits synthetic sample rows to a one-row template without relaxing real overflow checks',async()=>{
    const f=await fixture();f.binding.lineItems!.endRow=3;f.binding.lineItems!.minRows=1
    const original=sampleTemplateRenderData()
    const data=nativeSampleData(f.binding,original)
    assert.equal(data.lines.length,1)
    assert.equal(data.total,'$925.00')
    assert.equal(original.lines.length,2)
    await fillNativeExcel(f.grid,f.binding,data)
    await assert.rejects(fillNativeExcel(f.grid,f.binding,original),/预留 1 行/)
  })
})
