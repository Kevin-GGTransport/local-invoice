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

async function preprocessImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  try {
    const maxDimension = Math.max(bitmap.width, bitmap.height)
    const scale = maxDimension <= 1600 ? 2.05 : Math.min(1, 2400 / maxDimension)
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext("2d")
    if (!context) throw new Error("无法初始化图片画布")

    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = "high"
    context.filter = "grayscale(100%) contrast(125%)"
    context.drawImage(bitmap, 0, 0, width, height)

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((result) => resolve(result), "image/png")
    )
    if (!blob) throw new Error("图片预处理失败")
    return blob
  } finally {
    bitmap.close()
  }
}

export async function recognizeSocImage(
  file: File,
  onProgress?: (progress: SocOcrProgress) => void
): Promise<SocOcrResult> {
  const [image, { createWorker, PSM }] = await Promise.all([
    preprocessImage(file),
    import("tesseract.js"),
  ])
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
    const { data } = await worker.recognize(image, { rotateAuto: true })
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
