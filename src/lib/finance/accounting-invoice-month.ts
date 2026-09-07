/** Calendar dates, independent of browser timezone and daylight saving time. */
export function invoiceMonthRange(year: number, month: number) {
  const prefix = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return { from: `${prefix}-01`, to: `${prefix}-${lastDay}` }
}

export function selectedInvoiceMonth(year: number, from: string, to: string): number | null {
  for (let month = 1; month <= 12; month++) {
    const range = invoiceMonthRange(year, month)
    if (range.from === from && range.to === to) return month
  }
  return null
}
