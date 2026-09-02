import { PDFDocument } from 'pdf-lib'

/**
 * 将多份 PDF Buffer 按顺序合并为一份 PDF
 */
export async function mergePdfBuffers(buffers: Buffer[]): Promise<Buffer> {
  if (buffers.length === 0) {
    throw new Error('至少需要一份 PDF')
  }
  if (buffers.length === 1) {
    return buffers[0]
  }
  const merged = await PDFDocument.create()
  for (const buf of buffers) {
    const doc = await PDFDocument.load(buf as Uint8Array)
    const indices = doc.getPageIndices()
    const pages = await merged.copyPages(doc, indices)
    pages.forEach((p) => merged.addPage(p))
  }
  const out = await merged.save()
  return Buffer.from(out)
}
