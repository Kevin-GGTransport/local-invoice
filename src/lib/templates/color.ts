export interface SpreadsheetColor {
  argb?: string
  rgb?: string
  theme?: number
  tint?: number
}

const THEME_ORDER = ['lt1', 'dk1', 'lt2', 'dk2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink'] as const

const byte = (value: number) => Math.max(0, Math.min(255, Math.round(value)))
const hexByte = (value: number) => byte(value).toString(16).padStart(2, '0').toUpperCase()

/** Normalize common editor/runtime colors without changing transparency semantics. */
export function normalizeTemplateColor(value: string | undefined): string | null {
  if (!value) return null
  const color = value.trim()
  let match = color.match(/^#?([0-9a-f]{6})$/i)
  if (match) return `#${match[1].toUpperCase()}`
  match = color.match(/^#?([0-9a-f])([0-9a-f])([0-9a-f])$/i)
  if (match) return `#${match[1]}${match[1]}${match[2]}${match[2]}${match[3]}${match[3]}`.toUpperCase()
  match = color.match(/^#([0-9a-f]{6})([0-9a-f]{2})$/i)
  if (match) {
    const alpha = parseInt(match[2], 16) / 255
    return alpha === 1 ? `#${match[1].toUpperCase()}` : `rgba(${parseInt(match[1].slice(0, 2), 16)}, ${parseInt(match[1].slice(2, 4), 16)}, ${parseInt(match[1].slice(4, 6), 16)}, ${Number(alpha.toFixed(4))})`
  }
  match = color.match(/^rgba?\(\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*[, ]\s*([\d.]+)(?:\s*[,/]\s*([\d.]+)(%)?)?\s*\)$/i)
  if (!match) return null
  const alphaRaw = match[4] == null ? 1 : Number(match[4])
  const alpha = match[5] ? alphaRaw / 100 : alphaRaw
  const red = byte(Number(match[1]))
  const green = byte(Number(match[2]))
  const blue = byte(Number(match[3]))
  if (alpha >= 1) return `#${hexByte(red)}${hexByte(green)}${hexByte(blue)}`
  return `rgba(${red}, ${green}, ${blue}, ${Number(Math.max(0, alpha).toFixed(4))})`
}

/** Preserve legacy CSS/PDF color syntax when it is outside the normalized subset. */
export function templateRenderColor(value: string | undefined): string | null {
  return normalizeTemplateColor(value) ?? value?.trim() ?? null
}

function rgbToHsl(red: number, green: number, blue: number): [number, number, number] {
  const r = red / 255
  const g = green / 255
  const b = blue / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const lightness = (max + min) / 2
  if (max === min) return [0, 0, lightness]
  const delta = max - min
  const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min)
  const hue = max === r
    ? ((g - b) / delta + (g < b ? 6 : 0)) / 6
    : max === g
      ? ((b - r) / delta + 2) / 6
      : ((r - g) / delta + 4) / 6
  return [hue, saturation, lightness]
}

function hslToRgb(hue: number, saturation: number, lightness: number): [number, number, number] {
  if (saturation === 0) {
    const gray = byte(lightness * 255)
    return [gray, gray, gray]
  }
  const q = lightness < 0.5 ? lightness * (1 + saturation) : lightness + saturation - lightness * saturation
  const p = 2 * lightness - q
  const channel = (tRaw: number) => {
    let t = tRaw
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  return [byte(channel(hue + 1 / 3) * 255), byte(channel(hue) * 255), byte(channel(hue - 1 / 3) * 255)]
}

/** Excel tint changes HSL luminance rather than mixing RGB channels directly. */
export function applyExcelTint(hex: string, tint = 0): string {
  const normalized = normalizeTemplateColor(hex)
  if (!normalized || !Number.isFinite(tint) || tint === 0) return normalized ?? '#000000'
  const red = parseInt(normalized.slice(1, 3), 16)
  const green = parseInt(normalized.slice(3, 5), 16)
  const blue = parseInt(normalized.slice(5, 7), 16)
  const [hue, saturation, originalLightness] = rgbToHsl(red, green, blue)
  const amount = Math.max(-1, Math.min(1, tint))
  const lightness = amount < 0
    ? originalLightness * (1 + amount)
    : originalLightness * (1 - amount) + amount
  const [r, g, b] = hslToRgb(hue, saturation, lightness)
  return `#${hexByte(r)}${hexByte(g)}${hexByte(b)}`
}

export function parseExcelThemeColors(themeXml: string | undefined): string[] {
  if (!themeXml) return []
  return THEME_ORDER.map((name) => {
    const block = themeXml.match(new RegExp(`<(?:[\\w.-]+:)?${name}\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?${name}>`, 'i'))?.[1]
    const value = block?.match(/<(?:[\w.-]+:)?srgbClr\b[^>]*\bval="([0-9a-f]{6})"/i)?.[1]
      ?? block?.match(/<(?:[\w.-]+:)?sysClr\b[^>]*\blastClr="([0-9a-f]{6})"/i)?.[1]
    return value ? `#${value.toUpperCase()}` : ''
  })
}

export function resolveSpreadsheetColor(color: SpreadsheetColor | undefined, themeColors: string[]): string | null {
  if (!color) return null
  const raw = color.argb ?? color.rgb
  if (raw && /^[0-9a-f]{8}$/i.test(raw)) {
    // Excel cell colors are opaque; retain the historical behavior of discarding the ARGB alpha byte.
    return `#${raw.slice(2).toUpperCase()}`
  }
  if (raw) return normalizeTemplateColor(raw)
  if (color.theme != null) {
    const themed = themeColors[color.theme]
    return themed ? applyExcelTint(themed, color.tint) : null
  }
  return null
}
