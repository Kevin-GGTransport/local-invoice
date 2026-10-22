export const SOC_IMAGE_MAX_SIZE = 10 * 1024 * 1024
export const SOC_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"]
const TESSERACT_ASSET_BASE = "/tesseract"

export type SocOcrProgress = {
  status: string
  progress: number
}

export type SocOcrResult = {
  text: string
  confidence: number | null
}

export function validateSocImage(file: File): string | null {
  if (!SOC_IMAGE_TYPES.includes(file.type)) {
    return "请选择 PNG、JPG 或 WEBP 图片"
  }
  if (file.size > SOC_IMAGE_MAX_SIZE) {
    return "图片不能超过 10MB"
  }
  return null
}

export async function recognizeSocImage(
  file: File,
  onProgress?: (progress: SocOcrProgress) => void
): Promise<SocOcrResult> {
  const { createWorker, PSM } = await import("tesseract.js")
  let worker: Awaited<ReturnType<typeof createWorker>> | undefined

  try {
    worker = await createWorker("eng", 1, {
      workerPath: `${TESSERACT_ASSET_BASE}/worker.min.js`,
      corePath: `${TESSERACT_ASSET_BASE}/core`,
      langPath: `${TESSERACT_ASSET_BASE}/tessdata`,
      gzip: false,
      cacheMethod: "none",
      logger: (message) => {
        const progress = Number(message.progress)
        onProgress?.({
          status: message.status,
          progress: Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0,
        })
      },
    })
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.AUTO,
      preserve_interword_spaces: "1",
      user_defined_dpi: "300",
    })
    const { data } = await worker.recognize(file, { rotateAuto: true })
    return {
      text: data.text ?? "",
      confidence: typeof data.confidence === "number" ? data.confidence : null,
    }
  } finally {
    try {
      await worker?.terminate()
    } catch (error) {
      console.error("Failed to terminate the OCR worker", error)
    }
  }
}
