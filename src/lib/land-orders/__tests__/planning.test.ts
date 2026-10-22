import assert from "node:assert/strict"
import test from "node:test"
import { buildLandOrderPlanningRow } from "../planning"
import type { LandOrderPlanningSource } from "../planning"

function source(): LandOrderPlanningSource {
  return {
    id: BigInt(1),
    identifier: "AA",
    operating_company: "AA",
    dispatch_person: "刘辉Eric",
    broker: "Matrix",
    load_number: "141288",
    quantity: "26",
    pallet_positions: "13",
    weight_lbs: "44000",
    price: "700",
    load_type: "full",
    delivery_person: "Eric",
    status: "confirmed",
    note: "clean trailer",
    land_order_stops: [
      {
        stop_type: "drop",
        sequence: 4,
        company_name: "Fastenal",
        city: "Modesto",
        state: "CA",
        stop_date: "2026-10-21",
        time_from: "06:00",
        time_to: "20:00",
      },
      {
        stop_type: "pickup",
        sequence: 2,
        company_name: "Filtration Group",
        city: "Santa Rosa",
        state: "CA",
        stop_date: "2026-10-20",
        time_from: "08:00",
        time_to: "14:00",
        reference_numbers: "240338916 / 240339098",
      },
      {
        stop_type: "pickup",
        sequence: 1,
        company_name: "Second Pickup",
        city: "Ontario",
        state: "CA",
        stop_date: "2026-10-19",
      },
    ],
  }
}

test("多提多卸按 sequence 汇总并保留换行", () => {
  const row = buildLandOrderPlanningRow(source())
  assert.equal(row.id, "1")
  assert.equal(row.quantity, 26)
  assert.equal(row.weight_lbs, 44000)
  assert.equal(
    row.pickup_locations,
    "Second Pickup / Ontario, CA\nFiltration Group / Santa Rosa, CA\nPU# 240338916 / 240339098"
  )
  assert.equal(row.pickup_dates, "10/19\n10/20")
  assert.equal(row.pickup_times, "08:00-14:00")
  assert.equal(row.drop_locations, "Fastenal / Modesto, CA")
  assert.equal(row.drop_dates, "10/21")
  assert.equal(row.drop_times, "06:00-20:00")
})
