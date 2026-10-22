import type { Prisma } from "@prisma/client"
import { parseSelectedLandOrderIds } from "./query"
import type { LandOrderCreateInput, LandOrderPatchInput, LandOrderStopInput } from "./validation"

export function parseLandOrderId(raw: string): bigint | null {
  if (!/^[1-9]\d*$/.test(raw)) return null
  const id = BigInt(raw)
  return id <= BigInt("9223372036854775807") ? id : null
}

export function parseLandOrderIds(raw: string | null): bigint[] {
  return parseSelectedLandOrderIds(raw)
}

export function toLandOrderCreateData(input: LandOrderCreateInput): Prisma.land_ordersCreateInput {
  return {
    identifier: input.identifier,
    operating_company: input.operating_company,
    dispatch_person: input.dispatch_person,
    broker: input.broker,
    load_number: input.load_number,
    quantity: input.quantity,
    pallet_positions: input.pallet_positions,
    weight_lbs: input.weight_lbs,
    price: input.price,
    load_type: input.load_type,
    haul_type: input.haul_type,
    driver: input.driver,
    trailer: input.trailer,
    delivery_person: input.delivery_person,
    status: input.status,
    note: input.note,
    todo_note: input.todo_note,
    todo_done: input.todo_done,
  }
}

export function toLandOrderUpdateData(input: LandOrderCreateInput): Prisma.land_ordersUpdateInput {
  return {
    identifier: input.identifier,
    operating_company: input.operating_company,
    dispatch_person: input.dispatch_person,
    broker: input.broker,
    load_number: input.load_number,
    quantity: input.quantity,
    pallet_positions: input.pallet_positions,
    weight_lbs: input.weight_lbs,
    price: input.price,
    load_type: input.load_type,
    haul_type: input.haul_type,
    driver: input.driver,
    trailer: input.trailer,
    delivery_person: input.delivery_person,
    status: input.status,
    note: input.note,
    todo_note: input.todo_note,
    todo_done: input.todo_done,
  }
}

export function toLandOrderPatchData(input: LandOrderPatchInput): Prisma.land_ordersUpdateInput {
  return {
    ...(input.status !== undefined ? { status: input.status } : {}),
    ...(input.todo_done !== undefined ? { todo_done: input.todo_done } : {}),
    ...(input.driver !== undefined ? { driver: input.driver } : {}),
    ...(input.trailer !== undefined ? { trailer: input.trailer } : {}),
  }
}

export function toLandOrderStopCreateData(
  stops: readonly LandOrderStopInput[],
  land_order_id: bigint
): Array<Prisma.land_order_stopsCreateManyInput> {
  return stops.map((stop, index) => ({
    land_order_id,
    stop_type: stop.stop_type,
    sequence: index + 1,
    company_name: stop.company_name,
    address: stop.address,
    city: stop.city,
    state: stop.state,
    zip_code: stop.zip_code,
    stop_date: new Date(`${stop.stop_date}T00:00:00.000Z`),
    time_from: stop.time_from ?? null,
    time_to: stop.time_to ?? null,
    time_type: stop.time_type,
    reference_numbers: stop.reference_numbers,
    stop_note: stop.stop_note,
  }))
}
