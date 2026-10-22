import { MAX_LAND_ORDER_STOPS } from "./validation"

export type SocParsedStop = {
  stop_type: "pickup" | "drop"
  company_name?: string
  address?: string
  city?: string
  state?: string
  zip_code?: string
  stop_date?: string
  time_from?: string
  time_to?: string
  time_type?: string
  reference_numbers?: string
  stop_note?: string
}

export type SocParsedOrder = {
  operating_company?: string
  broker?: string
  load_number?: string
  quantity?: string
  pallet_positions?: string
  weight_lbs?: string
  price?: string
  load_type?: "full" | "partial"
  note?: string
  stops: SocParsedStop[]
  warnings: string[]
}

export type SocMergeStop = {
  stop_type: "pickup" | "drop"
  company_name: string
  address: string
  city: string
  state: string
  zip_code: string
  stop_date: string
  time_from: string
  time_to: string
  time_type: string
  reference_numbers: string
  stop_note: string
}

export type SocMergeOrder = {
  operating_company: string
  broker: string
  load_number: string
  quantity: string
  pallet_positions: string
  weight_lbs: string
  price: string
  load_type: "" | "full" | "partial"
  note: string
  stops: SocMergeStop[]
}

const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
}

const STOP_HEADER_PATTERN =
  /\bStop\s*[-#]?\s*\d+\s*[:\-]?\s*(Pickup|Pick[- ]?Up|Origin|Shipper|Drop|Delivery|Deliver|Consignee|Destination)\b/gi

function normalizeLines(input: string): string[] {
  return input
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) =>
      line
        .replace(/[\u2018\u2019\u201b]/g, "'")
        .replace(/[\u201c\u201d]/g, '"')
        .replace(/\u00a0/g, " ")
        .replace(/[ \t]+/g, " ")
        .replace(/^[\s"'`~{[(._-]+/, "")
        .trim()
    )
    .filter(Boolean)
}

function cleanValue(value: string): string {
  return value
    .replace(/^[\s"'`~{[(._-]+/, "")
    .replace(/[\s"'`~\])}._-]+$/, "")
    .replace(/\s+/g, " ")
    .trim()
}

function numberText(value: string | undefined): string | undefined {
  if (!value) return undefined
  const normalized = value.replace(/[$,\s]/g, "")
  return /^-?\d+(?:\.\d+)?$/.test(normalized) ? normalized : undefined
}

function firstMatch(input: string, patterns: RegExp[]): string | undefined {
  for (const pattern of patterns) {
    const match = input.match(pattern)
    if (match?.[1]) {
      const value = cleanValue(match[1])
      if (value && !/^(?:n\/?a|none)$/i.test(value)) return value
    }
  }
  return undefined
}

function parseBroker(text: string, lines: string[]): string | undefined {
  const labeled = firstMatch(text, [/\bBroker\s*[:#]\s*([^\n]+)/i])
  if (labeled) return labeled.slice(0, 100)

  const confirmationIndex = lines.findIndex((line) =>
    /(?:rate|load|shipment)\s*(?:confirmation|confirm|con)|\bsoc\b/i.test(line)
  )
  if (confirmationIndex <= 0) return undefined

  const candidates = lines.slice(0, confirmationIndex).filter((line) => {
    if (line.length < 3 || line.length > 100) return false
    if (!/[A-Za-z]{3,}\s+[A-Za-z]{2,}/.test(line)) return false
    return !/^(?:rate|load|shipment|order|bill\s*to|carrier|page)\b/i.test(line)
  })
  const candidate = candidates.at(-1)
  return candidate ? cleanValue(candidate).slice(0, 100) : undefined
}

function parseOperatingCompany(text: string, lines: string[]): string | undefined {
  const labeled = firstMatch(text, [/\bCarrier\s*[:#]\s*([^\n]+)/i])
  if (labeled) return labeled.slice(0, 100)

  const carrierIndex = lines.findIndex((line) => /^Carrier\b/i.test(line))
  if (carrierIndex < 0) return undefined
  const searchEnd = Math.min(lines.length, carrierIndex + 35)
  const markerIndex = lines
    .slice(carrierIndex + 1, searchEnd)
    .findIndex((line) => /^(?:MC|DOT)\s*#/i.test(line))
  if (markerIndex >= 0) {
    for (let index = carrierIndex + 1 + markerIndex; index > carrierIndex; index -= 1) {
      const line = lines[index]
      if (/^(?:Address|Phone|Fax|Contact|Email)\b/i.test(line)) continue
      if (/[A-Za-z]{3,}/.test(line) && !/^\d/.test(line)) {
        return cleanValue(line).slice(0, 100)
      }
    }
  }

  const candidate = lines
    .slice(carrierIndex + 1, searchEnd)
    .find((line) =>
      /\b(?:incorporated|inc|llc|l\.l\.c|corp|corporation)\b/i.test(line)
    )
  return candidate ? cleanValue(candidate).slice(0, 100) : undefined
}

function parseSpecialNote(text: string): string | undefined {
  const match = text.match(
    /Special\s+Instructions\s*:?\s*([\s\S]*?)(?:\n\s*Transportation\s+Mode\b|\.?\s*Transportation\s+Mode\b)/i
  )
  const instruction = match?.[1]
    ?.replace(/\s+/g, " ")
    .trim()
    .slice(0, 350)

  const equipment = firstMatch(text, [/\bEquipment Required\s*[:#]\s*([^\n]+)/i])
  const services = firstMatch(text, [/\bServices\s*[:#]\s*([^\n]+)/i])
  return [instruction, equipment ? `Equipment: ${equipment}` : "", services ? `Services: ${services}` : ""]
    .filter(Boolean)
    .join("；")
    .slice(0, 500)
}

function padTwo(value: number): string {
  return String(value).padStart(2, "0")
}

function validIsoDate(year: number, month: number, day: number): string | undefined {
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return undefined
  }
  return `${year}-${padTwo(month)}-${padTwo(day)}`
}

type DateOccurrence = { value: string; index: number }
type TimeOccurrence = { value: string; index: number }

function collectDateOccurrences(input: string): DateOccurrence[] {
  const result: DateOccurrence[] = []
  const monthPattern =
    /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/gi
  for (const match of input.matchAll(monthPattern)) {
    const month = MONTHS[match[1].toLowerCase()]
    const value = validIsoDate(Number(match[3]), month, Number(match[2]))
    if (value && match.index != null) result.push({ value, index: match.index })
  }

  const numericPattern = /\b(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})\b/g
  for (const match of input.matchAll(numericPattern)) {
    const rawYear = Number(match[3])
    const year = match[3].length === 2 ? 2000 + rawYear : rawYear
    const value = validIsoDate(year, Number(match[1]), Number(match[2]))
    if (value && match.index != null) result.push({ value, index: match.index })
  }
  return result
}

function toTwentyFourHour(hour: number, minute: number, meridiem: string): string {
  const normalized = meridiem.toLowerCase().startsWith("p") && hour !== 12 ? hour + 12 : hour
  const normalizedHour = meridiem.toLowerCase().startsWith("a") && hour === 12 ? 0 : normalized
  return `${padTwo(normalizedHour)}:${padTwo(minute)}`
}

function collectTimeOccurrences(input: string): TimeOccurrence[] {
  const meridiemPattern = /\b(\d{1,2})(?::(\d{2}))?\s*([AP])\.?\s*M\.?\b/gi
  const result: TimeOccurrence[] = []
  const meridiemIndexes: number[] = []
  for (const match of input.matchAll(meridiemPattern)) {
    if (match.index == null) continue
    meridiemIndexes.push(match.index)
    result.push({
      value: toTwentyFourHour(
        Number(match[1]),
        match[2] ? Number(match[2]) : 0,
        match[3].toUpperCase()
      ),
      index: match.index,
    })
  }

  const twentyFourPattern = /\b([01]?\d|2[0-3]):([0-5]\d)\b/g
  for (const match of input.matchAll(twentyFourPattern)) {
    if (match.index == null) continue
    if (meridiemIndexes.some((index) => Math.abs(index - match.index) <= 6)) continue
    result.push({
      value: `${padTwo(Number(match[1]))}:${match[2]}`,
      index: match.index,
    })
  }
  return result.sort((a, b) => a.index - b.index)
}

function parseStopDateAndTimes(input: string): {
  stop_date?: string
  time_from?: string
  time_to?: string
} {
  const dates = collectDateOccurrences(input)
  const times = collectTimeOccurrences(input)
  const stopDate = dates[0]?.value
  if (!stopDate) return {}

  const meaningfulTimes = times.filter((time) => time.index >= dates[0].index)
  const from = meaningfulTimes[0]?.value
  const to = meaningfulTimes.at(-1)?.value ?? from
  return from ? { stop_date: stopDate, time_from: from, time_to: to } : { stop_date: stopDate }
}

function parseTimeType(input: string): string | undefined {
  if (/\b(?:FCFS|first\s*come(?:\s*first\s*serve[d]?)?)\b/i.test(input)) return "FCFS"
  if (/\b(?:APPT\.?|appointment|by appointment)\b/i.test(input)) return "APPT"
  return undefined
}

function parseCityStateZip(input: string): {
  city?: string
  state?: string
  zip_code?: string
} {
  const match = input.match(
    /\b([A-Za-z][A-Za-z .'-]{1,60}),\s*([A-Za-z]{2})\s+([$OIlSB\d]{4,10}(?:-[$OIlSB\d]{4})?)(?![$OIlSB\d])/
  )
  if (!match) return {}
  const zipDigits = match[3].replace(/O/g, "0").replace(/[Il]/g, "1").replace(/S/g, "5").replace(/B/g, "8").replace(/\D/g, "")
  if (zipDigits.length !== 5 && zipDigits.length !== 9) {
    return { city: cleanValue(match[1]), state: match[2].toUpperCase() }
  }
  return {
    city: cleanValue(match[1]),
    state: match[2].toUpperCase(),
    zip_code: zipDigits.slice(0, 5),
  }
}

function isBlankStop(stop: SocMergeStop): boolean {
  return (
    !stop.company_name &&
    !stop.address &&
    !stop.city &&
    !stop.state &&
    !stop.zip_code &&
    !stop.stop_date &&
    !stop.time_from &&
    !stop.time_to &&
    !stop.reference_numbers &&
    !stop.stop_note &&
    stop.time_type === "FCFS"
  )
}

function stopTypeFromHeader(header: string): "pickup" | "drop" | undefined {
  if (/\b(?:drop|deliver(?:y)?|consignee|destination)\b/i.test(header)) return "drop"
  if (/\b(?:pickup|pick[- ]?up|origin|shipper)\b/i.test(header)) return "pickup"
  return undefined
}

function parseStopSegment(segment: string): SocParsedStop | undefined {
  const lines = normalizeLines(segment)
  if (!lines.length) return undefined
  const stopType = stopTypeFromHeader(lines[0])
  if (!stopType) return undefined

  const inlineCompany = cleanValue(
    lines[0].match(
      /\b(?:Customer|Pickup From|Deliver(?:y)? To|Shipper|Consignee|Origin|Destination)\s*[:#-]?\s+(.+)$/i
    )?.[1] ?? ""
  )
  const customerLineIndex = lines.findIndex((line) => /^Customer\b/i.test(line))
  let company_name: string | undefined
  if (inlineCompany) {
    company_name = inlineCompany
  } else if (customerLineIndex >= 0) {
    const inline = cleanValue(lines[customerLineIndex].replace(/^Customer\s*[:#]?\s*/i, ""))
    company_name = inline || cleanValue(lines[customerLineIndex + 1] ?? "")
  } else if (
    /^(?:Pickup|Pick[- ]?Up|Origin|Shipper|Drop|Delivery|Deliver|Consignee|Destination)(?:\s+(?:From|To|Information))?$/i.test(
      lines[0]
    )
  ) {
    company_name = cleanValue(lines[1] ?? "")
  } else {
    company_name = cleanValue(
      lines.find(
        (line, index) =>
          index > 0 &&
          /[A-Za-z]{3,}/.test(line) &&
          !/^\d/.test(line) &&
          !/\b(?:date|fcfs|appt|phone|dock)\b/i.test(line)
      ) ?? ""
    )
  }

  const address =
    cleanValue(
      lines.find(
        (line) =>
          /^\d{1,6}\s+/.test(line) &&
          !/^(?:19|20)\d{2}\b/.test(line) &&
          !/[A-Za-z]{2},\s*[A-Za-z]{2}\s+\d/.test(line)
      ) ?? ""
    ) || undefined
  const location = parseCityStateZip(segment)
  const dateAndTime = parseStopDateAndTimes(segment)
  const phone = segment.match(/\(?\b\d{3}\)?\s*[-.]?\s*\d{3}\s*[-.]?\s*\d{4}\b/)
  const dock = segment.match(/\bDock\s*[:#]?\s*[A-Za-z0-9,-]+(?:[^\S\r\n]+[A-Za-z0-9,-]+){0,3}/i)
  const directReference = firstMatch(segment, [
    new RegExp(
      `\\b(?:${stopType === "pickup" ? "PU|Pickup|Shipper" : "DEL|Delivery|PO|BOL"})\\s*#\\s*:?\\s*([A-Za-z0-9][A-Za-z0-9 /|\\-]{2,60})`,
      "i"
    ),
  ])

  const stopNote = [
    phone?.[0] ? `Phone ${phone[0]}` : "",
    dock?.[0] ? dock[0] : "",
  ]
    .filter(Boolean)
    .join("；")

  const parsed: SocParsedStop = {
    stop_type: stopType,
    company_name: company_name?.slice(0, 200),
    address: address?.slice(0, 500),
    ...location,
    ...dateAndTime,
    time_type: parseTimeType(segment),
    reference_numbers: directReference?.split(/[\n;]+/).map(cleanValue).filter(Boolean).join(" / "),
    stop_note: stopNote.slice(0, 500) || undefined,
  }

  const hasLocation = parsed.company_name || parsed.address || parsed.city || parsed.state
  return hasLocation ? parsed : undefined
}

function parseStops(text: string): SocParsedStop[] {
  const headers = [...text.matchAll(STOP_HEADER_PATTERN)]
  const segments =
    headers.length > 1
      ? headers.map((match, index) => {
          const start = match.index ?? 0
          const end = index + 1 < headers.length ? headers[index + 1].index ?? text.length : text.length
          return text.slice(start, end)
        })
      : []

  const parsed = segments.map(parseStopSegment).filter((stop): stop is SocParsedStop => Boolean(stop))
  if (parsed.length) return parsed.slice(0, MAX_LAND_ORDER_STOPS)

  const stopsHeadingMatches = [...text.matchAll(/\bStops?\b/gi)]
  const stopsAreaStart = stopsHeadingMatches.at(-1)?.index ?? 0
  const stopsAreaLines = normalizeLines(text.slice(stopsAreaStart))
  const headingPattern =
    /^(?:Pickup(?: From)?|Pick[- ]?Up(?: From)?|Origin|Shipper|Drop|Delivery(?: To)?|Deliver(?:y)? To|Consignee|Destination)(?:\s+Information)?\s*(?:[:#-]\s*(.*))?$/i
  const headingIndexes = stopsAreaLines
    .map((line, index) => (headingPattern.test(line) ? index : -1))
    .filter((index) => index >= 0)
  const fallbackSegments =
    headingIndexes.length > 1
      ? headingIndexes.map((startIndex, index) =>
          stopsAreaLines
            .slice(startIndex, index + 1 < headingIndexes.length ? headingIndexes[index + 1] : stopsAreaLines.length)
            .join("\n")
        )
      : []
  return fallbackSegments
    .map(parseStopSegment)
    .filter((stop): stop is SocParsedStop => Boolean(stop))
    .slice(0, MAX_LAND_ORDER_STOPS)
}

function normalizeReferences(value: string): string {
  return value
    .split(/\s*(?:\/|\||,|;)\s*/)
    .map(cleanValue)
    .filter((item) => item && !/^(?:n\/?a|nia|none)$/i.test(item))
    .join(" / ")
}

function applyBillingReferences(text: string, stops: SocParsedStop[]): void {
  const pickup = stops.find((stop) => stop.stop_type === "pickup")
  const drop = stops.find((stop) => stop.stop_type === "drop")
  if (!pickup && !drop) return

  for (const line of normalizeLines(text)) {
    const match = line.match(/([A-Z0-9][A-Z0-9 /|.\\-]{1,100}?)\s*\(([^)]*)(?:\)|$)/i)
    if (!match) continue
    const value = normalizeReferences(match[1])
    if (!value) continue
    const label = match[2].toLowerCase()
    if (pickup && (label.includes("shipper") || label.includes("pickup"))) {
      pickup.reference_numbers = pickup.reference_numbers
        ? `${pickup.reference_numbers} / ${value}`
        : value
    } else if (
      drop &&
      (label.includes("delivery") || label.includes("po reference") || label.includes("bol"))
    ) {
      drop.reference_numbers = drop.reference_numbers
        ? `${drop.reference_numbers} / ${value}`
        : value
    }
  }
}

function parseLoadType(text: string): "full" | "partial" | undefined {
  if (/\b(?:ltl|partial|less[_ -]?than[_ -]?truckload)\b/i.test(text)) return "partial"
  if (/\b(?:truckload|ftl|full[_ -]?truckload)\b/i.test(text)) return "full"
  return undefined
}

export function parseSocText(input: string): SocParsedOrder {
  const text = input.replace(/\r\n?/g, "\n").trim()
  const lines = normalizeLines(text)
  const stops = parseStops(text)
  applyBillingReferences(text, stops)

  const warnings: string[] = []
  if (!stops.some((stop) => stop.stop_type === "pickup")) warnings.push("未识别到提货点")
  if (!stops.some((stop) => stop.stop_type === "drop")) warnings.push("未识别到卸货点")
  let pickupNumber = 0
  let dropNumber = 0
  for (const stop of stops) {
    const label =
      stop.stop_type === "pickup"
        ? `提货点 ${++pickupNumber}`
        : `卸货点 ${++dropNumber}`
    if (!stop.company_name) warnings.push(`${label}公司名未识别`)
    if (!stop.city || !stop.state) warnings.push(`${label}城市/州未识别`)
    if (!stop.zip_code || !/^\d{5}$/.test(stop.zip_code)) {
      warnings.push(`${label} Zip 未识别，请核对`)
    }
    if (!stop.stop_date) warnings.push(`${label}日期未识别`)
  }

  return {
    operating_company: parseOperatingCompany(text, lines),
    broker: parseBroker(text, lines),
    load_number: firstMatch(text, [
      /\bLOAD\s*ID\s*[:#]?\s*([A-Z0-9-]{3,})/i,
      /\bLoad\s*(?:#|No\.?|Number)\s*[:#]?\s*([A-Z0-9-]{3,})/i,
      /\bOrder\s*(?:#|No\.?|Number)\s*[:#]?\s*([A-Z0-9-]{3,})/i,
      /\bPRO\s*#\s*[:#]?\s*([A-Z0-9-]{3,})/i,
    ])?.slice(0, 100),
    quantity: numberText(
      firstMatch(text, [
        /\bUnits\s*[:#]\s*(\d+(?:\.\d+)?)/i,
        /\b(\d+(?:\.\d+)?)\s+(?:Pallets?|Cases?|Pieces?|Packages?|Skids?)/i,
      ])
    ),
    pallet_positions: numberText(
      firstMatch(text, [
        /\bLinear\s+Feet\s*[:#]?\s*(\d+(?:\.\d+)?)/i,
        /\bPallet\s+Positions?\s*[:#]?\s*(\d+(?:\.\d+)?)/i,
      ])
    ),
    weight_lbs: numberText(
      firstMatch(text, [
        /\b(?:Total|Gross)\s+Weight\s*[:#]?\s*(\$?[\d,]+(?:\.\d+)?)\s*(?:LB|LBS|POUNDS?)?/i,
        /\bWeight\s*[:#]\s*(\$?[\d,]+(?:\.\d+)?)\s*(?:LB|LBS|POUNDS?)?/i,
      ])
    ),
    price: numberText(
      firstMatch(text, [
        /\b(?:Shipping|Linehaul|Transportation)\s+Charges?\s*[:#]?\s*\$?\s*([\d,]+(?:\.\d+)?)/i,
        /\bTotal\s*[:#]\s*\$?\s*([\d,]+(?:\.\d+)?)/i,
      ])
    ),
    load_type: parseLoadType(text),
    note: parseSpecialNote(text) || undefined,
    stops,
    warnings: [...new Set(warnings)],
  }
}

function blankMergeStop(stopType: "pickup" | "drop"): SocMergeStop {
  return {
    stop_type: stopType,
    company_name: "",
    address: "",
    city: "",
    state: "",
    zip_code: "",
    stop_date: "",
    time_from: "",
    time_to: "",
    time_type: "FCFS",
    reference_numbers: "",
    stop_note: "",
  }
}

function mergeStopFields(
  target: SocMergeStop,
  parsed: SocParsedStop,
  replaceDefaults = false
): SocMergeStop {
  return {
    ...target,
    company_name: target.company_name || parsed.company_name || "",
    address: target.address || parsed.address || "",
    city: target.city || parsed.city || "",
    state: target.state || parsed.state || "",
    zip_code: target.zip_code || parsed.zip_code || "",
    stop_date: target.stop_date || parsed.stop_date || "",
    time_from: target.time_from || parsed.time_from || "",
    time_to: target.time_to || parsed.time_to || "",
    time_type: replaceDefaults
      ? parsed.time_type || "FCFS"
      : target.time_type || parsed.time_type || "FCFS",
    reference_numbers: target.reference_numbers || parsed.reference_numbers || "",
    stop_note: target.stop_note || parsed.stop_note || "",
  }
}

function normalizeParsedStop(parsed: SocParsedStop): SocMergeStop {
  return mergeStopFields(blankMergeStop(parsed.stop_type), parsed, true)
}

function findStopIndexByOrdinal(
  stops: SocMergeStop[],
  stopType: "pickup" | "drop",
  ordinal: number
): number {
  let seen = 0
  return stops.findIndex((stop) => {
    if (stop.stop_type !== stopType) return false
    if (seen === ordinal) return true
    seen += 1
    return false
  })
}

export function mergeSocIntoOrder<T extends SocMergeOrder>(current: T, parsed: SocParsedOrder): T {
  const next: T = {
    ...current,
    operating_company: current.operating_company || parsed.operating_company || "",
    broker: current.broker || parsed.broker || "",
    load_number: current.load_number || parsed.load_number || "",
    quantity: current.quantity || parsed.quantity || "",
    pallet_positions: current.pallet_positions || parsed.pallet_positions || "",
    weight_lbs: current.weight_lbs || parsed.weight_lbs || "",
    price: current.price || parsed.price || "",
    load_type: current.load_type || parsed.load_type || "full",
    note: current.note || parsed.note || "",
  }

  const stops = current.stops.map((stop) => ({ ...stop }))
  const existingTypeCounts = stops.reduce(
    (counts, stop) => {
      counts[stop.stop_type] += 1
      return counts
    },
    { pickup: 0, drop: 0 } as Record<"pickup" | "drop", number>
  )
  const parsedTypeCounts = { pickup: 0, drop: 0 }
  for (const parsedStop of parsed.stops) {
    const parsedIndexWithinType = parsedTypeCounts[parsedStop.stop_type]
    parsedTypeCounts[parsedStop.stop_type] += 1
    const blankIndex = stops.findIndex(
      (stop) => stop.stop_type === parsedStop.stop_type && isBlankStop(stop)
    )
    if (blankIndex >= 0) {
      stops[blankIndex] = mergeStopFields(stops[blankIndex], parsedStop, true)
      continue
    }

    const normalizedCompany = parsedStop.company_name?.toLowerCase().replace(/[^a-z0-9]/g, "")
    const matchingIndex = normalizedCompany
      ? stops.findIndex(
          (stop) =>
            stop.stop_type === parsedStop.stop_type &&
            stop.company_name.toLowerCase().replace(/[^a-z0-9]/g, "") === normalizedCompany
        )
      : -1
    if (matchingIndex >= 0) {
      stops[matchingIndex] = mergeStopFields(stops[matchingIndex], parsedStop)
      continue
    }

    const existingCount = existingTypeCounts[parsedStop.stop_type]
    const ordinalIndex =
      parsedIndexWithinType < existingCount
        ? findStopIndexByOrdinal(stops, parsedStop.stop_type, parsedIndexWithinType)
        : -1
    if (ordinalIndex >= 0) {
      stops[ordinalIndex] = mergeStopFields(stops[ordinalIndex], parsedStop)
      continue
    }

    if (stops.length < MAX_LAND_ORDER_STOPS) stops.push(normalizeParsedStop(parsedStop))
  }

  next.stops = [
    ...stops.filter((stop) => stop.stop_type === "pickup"),
    ...stops.filter((stop) => stop.stop_type === "drop"),
  ]
  return next
}
