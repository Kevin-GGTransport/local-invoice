/** Read-only source validation; outputs go to a new temp directory, never the source. */
import { readFile, writeFile, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'
import JSZip from 'jszip'
import { importNativeExcel, fillNativeExcel, nativeSourceBytes } from '../src/lib/templates/native-excel'
import { nativeExcelToPdf } from '../src/lib/services/print/native-excel-pdf'
import { sampleTemplateRenderData } from '../src/lib/templates/render-template-data'
import type { TemplateBinding } from '../src/lib/templates/types'

async function main() {
  const [input, bindingFile] = process.argv.slice(2)
  if (!input) throw new Error('Usage: tsx scripts/verify-native-excel.ts source.xlsx [bindings.json]')
  const bytes = await readFile(input)
  const imported = await importNativeExcel(bytes, 'template.xlsx')
  const binding: TemplateBinding = bindingFile ? JSON.parse(await readFile(bindingFile, 'utf8')) : imported.binding
  const data = sampleTemplateRenderData()
  data.lines = [{description:'Carrier Charge',quantity:'1',unitPrice:'$399.00',amount:'$399.00'}]
  data.total='$399.00'
  const filled = await fillNativeExcel(imported.grid, binding, data)
  assert.deepEqual(nativeSourceBytes(imported.grid),bytes)
  const before = await JSZip.loadAsync(bytes), after = await JSZip.loadAsync(filled)
  let unchanged = 0
  const changed: string[] = []
  for (const name of Object.keys(before.files)) {
    if(before.files[name].dir)continue
    if((await before.file(name)!.async('nodebuffer')).equals(await after.file(name)!.async('nodebuffer'))) unchanged++
    else changed.push(name)
  }
  assert.equal(changed.length,1,'Only the bound worksheet should change')
  assert.match(changed[0],/^xl\/worksheets\//)
  const dir = await mkdtemp(join(tmpdir(),'native-template-verification-'))
  await writeFile(join(dir,'filled.xlsx'),filled)
  await writeFile(join(dir,'source.pdf'),await nativeExcelToPdf(bytes))
  await writeFile(join(dir,'filled.pdf'),await nativeExcelToPdf(filled))
  console.log(JSON.stringify({dir,unchangedParts:unchanged,changedParts:changed,capacity:binding.lineItems?.minRows}))
}
main().catch(error=>{console.error(error);process.exitCode=1})
