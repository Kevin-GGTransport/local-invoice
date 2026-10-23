import assert from "node:assert/strict"
import test from "node:test"
import { mergeSocIntoOrder, parseSocText } from "../soc-parser"

const sampleOcr = `
ASSOCIATED
Associated Logistics Group
Rate Confirmation
LOAD ID: 65080071

Bill To
Carrier
3RD PARTY BILL
FREIGHT PREPAID TO:
Associated Logistics
Group
2550 University Ave W
STE 224.N
Saint Paul, MN 55114

ALREADY ARRIVED LOGISTICS INC
Address: 4011 Berdina Rd
Phone: 6789388805
MC # 853868
DOT #: 2469728

SPECIAL INSTRUCTIONS:
IF DELIVERY APPOINTMENT IS MISSED A $250 LATE FEE MAY APPLY.

Transportation Mode: Truckload
Equipment Required: Van
Services: Fuel Surcharge, Lumper Fee

Description of Articles
21 Pallets Wipes TAZZAWP1200-864
TAZZAHBSP-324
21 Pallet(s)
Linear Feet: 48.00
Total Weight: 27366 LB

Billing Information
65080071 (Load ID) 428.00
2637668 | 22760 (Shipper #)
NIA (Pickup Number)
NIA (Delivery Number)
NIA (BOL Number)
518491 (PO Reference)
1 (Driver Type)

Carrier Charges
Shipping Charges $700.00
Total: $700.00

Stops
Stop 1 Pickup
Customer
Terraboost Woodland
700 Santa Anita Drive Suite B
Woodland, CA 95776
(530) 848-0594
Dock 26-32
Date: Thursday, October 22, 2026 8:00 AM - Thursday, October
22, 2026 3:00 PM
FCFS

Stop 2 Drop
Customer
Bunzl Anaheim
3310 E Miraloma Ave
Anaheim, CA 92806
Date: Friday, October 23, 2026 11:00 AM - Friday, October 23,
2026 11:00 AM
APPT.

*PLEASE SEND YOUR CARRIER INVOICE TO AP@ASSOCIATEDLOGISTICS.COM*
*ALL LOADS MUST BE TRACKED WITH TRUCKERTOOLS UNLESS AUTHORIZATION FOR
EXCLUSION IS GRANTED*
`

function blankOrder() {
  return {
    operating_company: "",
    broker: "",
    load_number: "",
    quantity: "",
    pallet_positions: "",
    weight_lbs: "",
    price: "",
    load_type: "" as const,
    note: "",
    stops: [
      {
        stop_type: "pickup" as const,
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
      },
      {
        stop_type: "drop" as const,
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
      },
    ],
  }
}

test("解析 SOC 主信息和多个站点", () => {
  const parsed = parseSocText(sampleOcr)

  assert.equal(parsed.broker, "Associated Logistics Group")
  assert.equal(parsed.operating_company, "ALREADY ARRIVED LOGISTICS INC")
  assert.equal(parsed.load_number, "65080071")
  assert.equal(parsed.quantity, "21")
  assert.equal(parsed.pallet_positions, "21")
  assert.equal(parsed.weight_lbs, "27366")
  assert.equal(parsed.price, "700.00")
  assert.equal(parsed.load_type, "full")

  assert.equal(parsed.stops.length, 2)
  assert.deepEqual(parsed.stops[0], {
    stop_type: "pickup",
    company_name: "Terraboost Woodland",
    address: "700 Santa Anita Drive Suite B",
    city: "Woodland",
    state: "CA",
    zip_code: "95776",
    stop_date: "2026-10-22",
    time_from: "08:00",
    time_to: "15:00",
    time_type: "FCFS",
    reference_numbers: "2637668 / 22760",
    stop_note: "Phone (530) 848-0594；Dock 26-32",
  })
  assert.deepEqual(parsed.stops[1], {
    stop_type: "drop",
    company_name: "Bunzl Anaheim",
    address: "3310 E Miraloma Ave",
    city: "Anaheim",
    state: "CA",
    zip_code: "92806",
    stop_date: "2026-10-23",
    time_from: "11:00",
    time_to: "11:00",
    time_type: "APPT",
    reference_numbers: "518491",
    stop_note: undefined,
  })
  assert.deepEqual(parsed.warnings, [])
  assert.ok(parsed.note?.includes("Cargo: Wipes"))
  assert.ok(parsed.note?.includes("TAZZAWP1200-864"))
  assert.ok(parsed.note?.includes("LF: 48.00"))
  assert.ok(parsed.note?.includes("Miles: 428.00"))
  assert.ok(parsed.note?.includes("MC#: 853868"))
  assert.ok(parsed.note?.includes("DOT#: 2469728"))
  assert.ok(parsed.note?.includes("Driver Type: 1"))
  assert.ok(parsed.note?.includes("Invoice: AP@ASSOCIATEDLOGISTICS.COM"))
  assert.ok(parsed.note?.includes("Tracking: TRUCKERTOOLS"))
})

test("兼容 OCR 常见误读和换行", () => {
  const parsed = parseSocText(`
Broker: Matrix Logistics
Load #: 141288
Transportation Mode: LTL
Total Weight: 44,000
Shipping Charges: $700
Stops
Stop 1 Pickup
Customer
FILTRATION GROUP
498 Aviation Blvd
Santa Rosa, CA $5776
10/20/2026 08:00 - 10/20/2026 14:00
FCFS
Stop 2 Delivery
Customer
Fastenal Company
4025 Finch Road
Modesto, CA 95357
10/21/2026 06:00 - 10/21/2026 20:00
Appointment
`)

  assert.equal(parsed.load_type, "partial")
  assert.equal(parsed.weight_lbs, "44000")
  assert.equal(parsed.price, "700")
  assert.equal(parsed.stops[0].zip_code, undefined)
  assert.equal(parsed.stops[0].stop_date, "2026-10-20")
  assert.deepEqual(
    [parsed.stops[0].time_from, parsed.stops[0].time_to],
    ["08:00", "14:00"]
  )
  assert.equal(parsed.stops[1].stop_type, "drop")
  assert.equal(parsed.stops[1].time_type, "APPT")
  assert.deepEqual(parsed.warnings, ["提货点 1 Zip 未识别，请核对"])
})

test("兼容非编号的提货/交货标题样式", () => {
  const parsed = parseSocText(`
Broker: Test Broker
Load ID: A20001
Pickup From: Alpha Warehouse
100 Main Street
Reno, NV 89502
11/02/2026 9:00 AM - 11/02/2026 12:00 PM
FCFS
Delivery To: Beta Distribution
200 Second Street
Fresno, CA 93721
11/03/2026 1:00 PM - 11/03/2026 3:00 PM
APPT
`)

  assert.equal(parsed.stops.length, 2)
  assert.equal(parsed.stops[0].company_name, "Alpha Warehouse")
  assert.equal(parsed.stops[1].company_name, "Beta Distribution")
  assert.equal(parsed.stops[0].stop_date, "2026-11-02")
  assert.equal(parsed.stops[1].stop_date, "2026-11-03")
  assert.equal(parsed.stops[1].time_type, "APPT")
})

test("兼容 Shipper / Consignee 标题样式", () => {
  const parsed = parseSocText(`
SHIPPER
Alpha Warehouse
100 Main Street
Reno, NV 89502
11/02/2026 9:00 AM - 11/02/2026 12:00 PM
CONSIGNEE
Beta Distribution
200 Second Street
Fresno, CA 93721
11/03/2026 1:00 PM - 11/03/2026 3:00 PM
`)

  assert.equal(parsed.stops.length, 2)
  assert.equal(parsed.stops[0].stop_type, "pickup")
  assert.equal(parsed.stops[1].stop_type, "drop")
  assert.equal(parsed.stops[0].company_name, "Alpha Warehouse")
  assert.equal(parsed.stops[1].company_name, "Beta Distribution")
})

test("多位 Zip 识别错误时不截断", () => {
  const parsed = parseSocText(`
Stop 1 Pickup
Customer
Alpha
Fresno, CA 953721
10/20/2026 08:00 - 10/20/2026 10:00
Stop 2 Delivery
Customer
Beta
Modesto, CA 95357-1234
10/21/2026 08:00 - 10/21/2026 10:00
`)

  assert.equal(parsed.stops[0].zip_code, undefined)
  assert.equal(parsed.stops[1].zip_code, "95357")
  assert.deepEqual(parsed.warnings, ["提货点 1 Zip 未识别，请核对"])
})

test("多货品数量优先使用总量而不是第一条货品", () => {
  const parsed = parseSocText(`
Description of Articles
10 Pallets Product A
11 Pallets Product B
21 Pallet(s)
Total Weight: 1000 LB
Stop 1 Pickup
Customer
Alpha Warehouse Friday, October 23, 2026 11:00 AM
Los Angeles, CA 90001
Stop 2 Delivery
Customer
Beta Distribution
Fresno, CA 93721
`)

  assert.equal(parsed.quantity, "21")
  assert.equal(parsed.pallet_positions, "21")
  assert.equal(parsed.stops[0].company_name, "Alpha Warehouse")
})

test("识别结果只填入空字段且保留手工内容", () => {
  const parsed = parseSocText(sampleOcr)
  const merged = mergeSocIntoOrder(
    {
      ...blankOrder(),
      broker: "Manual Broker",
      load_number: "A100",
      stops: [
        {
          ...blankOrder().stops[0],
          company_name: "Custom Pickup",
          city: "Los Angeles",
          state: "CA",
          time_type: "APPT",
        },
        blankOrder().stops[1],
      ],
    },
    parsed
  )

  assert.equal(merged.broker, "Manual Broker")
  assert.equal(merged.load_number, "A100")
  assert.equal(merged.stops.length, 2)
  assert.equal(merged.stops[0].company_name, "Custom Pickup")
  assert.equal(merged.stops[0].city, "Los Angeles")
  assert.equal(merged.stops[0].address, "700 Santa Anita Drive Suite B")
  assert.equal(merged.stops[0].time_from, "08:00")
  assert.equal(merged.stops[0].time_type, "APPT")
  assert.equal(merged.stops[1].company_name, "Bunzl Anaheim")
  assert.equal(merged.stops[1].time_from, "11:00")
  assert.equal(merged.stops[1].time_type, "APPT")
})

test("识别结果可替换默认装载类型", () => {
  const parsed = parseSocText(`
Transportation Mode: LTL
Stops
Stop 1 Pickup
Customer
Alpha
Los Angeles, CA 90001
10/20/2026 08:00 - 10/20/2026 10:00
Stop 2 Drop
Customer
Beta
Fresno, CA 93721
10/21/2026 08:00 - 10/21/2026 10:00
`)
  const merged = mergeSocIntoOrder(blankOrder(), parsed)
  assert.equal(merged.load_type, "partial")
})

test("识别到多位站点时不会合并丢失", () => {
  const parsed = parseSocText(`
Stop 1 Pickup
Customer
Pickup A
Los Angeles, CA 90001
10/20/2026 08:00 - 10/20/2026 10:00
Stop 2 Pickup
Customer
Pickup B
Ontario, CA 91761
10/20/2026 12:00 - 10/20/2026 14:00
Stop 3 Drop
Customer
Drop A
Fresno, CA 93721
10/21/2026 08:00 - 10/21/2026 10:00
Stop 4 Drop
Customer
Drop B
Modesto, CA 95357
10/21/2026 12:00 - 10/21/2026 14:00
`)
  const merged = mergeSocIntoOrder(blankOrder(), parsed)

  assert.equal(parsed.stops.length, 4)
  assert.equal(merged.stops.length, 4)
  assert.deepEqual(
    merged.stops.map((stop) => stop.company_name),
    ["Pickup A", "Pickup B", "Drop A", "Drop B"]
  )
})
