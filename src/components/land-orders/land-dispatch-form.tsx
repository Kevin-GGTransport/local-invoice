"use client"

import React from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Loader2, Save } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { fetchJson, getRequestErrorMessage } from "@/lib/api/client"

type LandOrderOption = {
  id: string
  identifier: string | null
  load_number: string | null
  pickup_dates: string
  drop_locations: string
}

type LandDispatchRecord = Record<string, unknown>

type OrderStopDetail = {
  stop_type: "pickup" | "drop"
  company_name: string
  address: string
  city: string
  state: string
  zip_code: string
  stop_date: string
  time_from: string
  time_to: string
  reference_numbers: string
}

type SelectedOrderDetail = {
  id: string
  identifier: string | null
  load_number: string | null
  operating_company: string
  broker: string | null
  stops: OrderStopDetail[]
}

type FormValues = {
  land_order_id: string
  dispatch_date: string
  truck: string
  driver: string
  trailer: string
  haul_type: "local" | "long_haul"
  status: "planned" | "dispatched" | "completed" | "cancelled"
  todo_note: string
  todo_done: boolean
  sort_order: string
}

function text(value: unknown): string {
  return value == null ? "" : String(value)
}

function dateText(value: unknown): string {
  return text(value).slice(0, 10)
}

function orderDetailFromRecord(record: LandDispatchRecord): SelectedOrderDetail {
  const rawStops = Array.isArray(record.land_order_stops) ? record.land_order_stops : []
  return {
    id: text(record.id),
    identifier: text(record.identifier) || null,
    load_number: text(record.load_number) || null,
    operating_company: text(record.operating_company),
    broker: text(record.broker) || null,
    stops: rawStops.map((rawStop) => {
      const stop = rawStop as LandDispatchRecord
      return {
        stop_type: text(stop.stop_type) === "drop" ? "drop" : "pickup",
        company_name: text(stop.company_name),
        address: text(stop.address),
        city: text(stop.city),
        state: text(stop.state),
        zip_code: text(stop.zip_code),
        stop_date: dateText(stop.stop_date),
        time_from: text(stop.time_from),
        time_to: text(stop.time_to),
        reference_numbers: text(stop.reference_numbers),
      }
    }),
  }
}

function StopCard({ stop, index }: { stop: OrderStopDetail; index: number }) {
  const lines = [
    `${stop.company_name || "未填写公司"} · ${stop.city || "未填写城市"}, ${stop.state || "--"} ${stop.zip_code}`,
    stop.address,
    `${stop.stop_date || "未填写日期"} ${stop.time_from && stop.time_to ? `${stop.time_from}-${stop.time_to}` : ""}`.trim(),
    stop.reference_numbers ? `${stop.stop_type === "pickup" ? "PU#" : "DEL#"} ${stop.reference_numbers}` : "",
  ].filter(Boolean)

  return (
    <li className="rounded-lg border bg-background/60 p-3">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <span className="flex size-5 items-center justify-center rounded-full border">{index + 1}</span>
        {stop.stop_type === "pickup" ? "提货点" : "卸货点"}
      </div>
      <div className="mt-2 space-y-1 text-sm">
        {lines.map((line) => (
          <p key={line} className="break-words">{line}</p>
        ))}
      </div>
    </li>
  )
}

function emptyValues(): FormValues {
  return {
    land_order_id: "",
    dispatch_date: "",
    truck: "",
    driver: "",
    trailer: "",
    haul_type: "long_haul",
    status: "planned",
    todo_note: "",
    todo_done: false,
    sort_order: "0",
  }
}

export function LandDispatchForm({ dispatchId }: { dispatchId?: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const isEditing = dispatchId != null
  const [orders, setOrders] = React.useState<LandOrderOption[]>([])
  const [selectedOrder, setSelectedOrder] = React.useState<SelectedOrderDetail | null>(null)
  const [orderSearch, setOrderSearch] = React.useState("")
  const [values, setValues] = React.useState<FormValues>(emptyValues)
  const [loading, setLoading] = React.useState(true)
  const [orderLoading, setOrderLoading] = React.useState(false)
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const orderData = await fetchJson<{ rows: LandOrderOption[] }>(
          "/api/land-orders?pageSize=100&sort=pickup_date&order=desc"
        )
        let selectedOrder: LandOrderOption | null = null
        if (cancelled) return
        if (isEditing) {
          const record = await fetchJson<LandDispatchRecord>(`/api/land-dispatches/${dispatchId}`)
          if (cancelled) return
          const related = record.land_orders as LandDispatchRecord | undefined
          if (related) {
            const relatedDetail = orderDetailFromRecord(related)
            setSelectedOrder(relatedDetail)
            selectedOrder = {
              id: relatedDetail.id,
              identifier: relatedDetail.identifier,
              load_number: relatedDetail.load_number,
              pickup_dates: relatedDetail.stops.find((stop) => stop.stop_type === "pickup")?.stop_date ?? "",
              drop_locations: text(related.delivery_person),
            }
          }
          setValues({
            land_order_id: text(record.land_order_id),
            dispatch_date: dateText(record.dispatch_date),
            truck: text(record.truck),
            driver: text(record.driver),
            trailer: text(record.trailer),
            haul_type: (text(record.haul_type) || "long_haul") as FormValues["haul_type"],
            status: (text(record.status) || "planned") as FormValues["status"],
            todo_note: text(record.todo_note),
            todo_done: record.todo_done === true,
            sort_order: text(record.sort_order || "0"),
          })
        } else {
          const orderId = searchParams.get("orderId") ?? ""
          if (orderId) {
            const detail = await fetchJson<LandDispatchRecord>(`/api/land-orders/${orderId}`)
            if (cancelled) return
            const detailOrder = orderDetailFromRecord(detail)
            setSelectedOrder(detailOrder)
            selectedOrder = {
              id: detailOrder.id,
              identifier: detailOrder.identifier,
              load_number: detailOrder.load_number,
              pickup_dates: detailOrder.stops.find((stop) => stop.stop_type === "pickup")?.stop_date ?? "",
              drop_locations: text(detail.delivery_person),
            }
          }
          setValues((prev) => ({
            ...prev,
            land_order_id: orderId,
            dispatch_date: selectedOrder ? new Date().toISOString().slice(0, 10) : "",
          }))
        }
        if (!cancelled) {
          setOrders(
            selectedOrder
              ? [selectedOrder, ...orderData.rows.filter((order) => order.id !== selectedOrder!.id)]
              : orderData.rows
          )
        }
      } catch (error) {
        toast.error(getRequestErrorMessage(error, "加载排车信息失败"))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [dispatchId, isEditing, searchParams])

  const update = <K extends keyof FormValues>(key: K, value: FormValues[K]) => {
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  const selectOrder = async (orderId: string) => {
    update("land_order_id", orderId)
    if (!orderId) {
      setSelectedOrder(null)
      return
    }
    setOrderLoading(true)
    try {
      const detail = await fetchJson<LandDispatchRecord>(`/api/land-orders/${orderId}`)
      setSelectedOrder(orderDetailFromRecord(detail))
      if (!values.dispatch_date) {
        update("dispatch_date", new Date().toISOString().slice(0, 10))
      }
    } catch (error) {
      setSelectedOrder(null)
      toast.error(getRequestErrorMessage(error, "加载订单站点失败"))
    } finally {
      setOrderLoading(false)
    }
  }

  const searchOrders = async () => {
    setLoading(true)
    try {
      const data = await fetchJson<{ rows: LandOrderOption[] }>(
        `/api/land-orders?pageSize=100&sort=pickup_date&order=desc&q=${encodeURIComponent(orderSearch)}`
      )
      setOrders((prev) => {
        const selected = values.land_order_id
          ? prev.find((order) => order.id === values.land_order_id)
          : null
        return selected
          ? [selected, ...data.rows.filter((order) => order.id !== selected.id)]
          : data.rows
      })
    } catch (error) {
      toast.error(getRequestErrorMessage(error, "搜索陆运订单失败"))
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!values.land_order_id) {
      toast.error("请选择陆运订单")
      return
    }
    if (!values.dispatch_date) {
      toast.error("请填写排车日期")
      return
    }
    setSaving(true)
    try {
      const payload = {
        land_order_id: values.land_order_id,
        dispatch_date: values.dispatch_date,
        truck: values.truck,
        driver: values.driver,
        trailer: values.trailer,
        haul_type: values.haul_type,
        status: values.status,
        todo_note: values.todo_note,
        todo_done: values.todo_done,
        sort_order: Number(values.sort_order) || 0,
      }
      if (isEditing) {
        const { land_order_id, ...patch } = payload
        void land_order_id
        await fetchJson(`/api/land-dispatches/${dispatchId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        })
        toast.success("排车记录已更新")
      } else {
        await fetchJson("/api/land-dispatches", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
        toast.success("已加入排车表")
      }
      router.push("/dashboard/land-dispatches")
      router.refresh()
    } catch (error) {
      toast.error(getRequestErrorMessage(error, "保存排车记录失败"))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-64 items-center justify-center rounded-xl border bg-card text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> 正在加载排车信息...
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <section className="space-y-4 rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">第一步：选择陆运订单</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              选择后自动带出该订单的全部提货点和卸货点。
            </p>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">搜索订单</Label>
            <div className="flex gap-2">
              <Input
                aria-label="搜索陆运订单"
                placeholder="Load# / 站点 / 标识"
                value={orderSearch}
                onChange={(event) => setOrderSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault()
                    void searchOrders()
                  }
                }}
              />
              <Button type="button" variant="outline" onClick={() => void searchOrders()}>
                搜索
              </Button>
            </div>
            <Select
              value={values.land_order_id}
              onValueChange={(value) => void selectOrder(value)}
              disabled={isEditing}
            >
              <SelectTrigger>
                <SelectValue placeholder="选择订单" />
              </SelectTrigger>
              <SelectContent>
                {orders.map((order) => (
                  <SelectItem key={order.id} value={order.id}>
                    {order.load_number || order.identifier || order.id} · {order.pickup_dates || "无提货日期"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="min-w-0 rounded-lg border bg-muted/40 p-3">
            {orderLoading ? (
              <div className="flex min-h-24 items-center justify-center text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> 正在带出订单站点...
              </div>
            ) : selectedOrder ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="text-sm font-semibold">
                    {selectedOrder.load_number || selectedOrder.identifier || selectedOrder.id}
                  </span>
                  <span className="text-xs text-muted-foreground">{selectedOrder.operating_company}</span>
                  {selectedOrder.broker && (
                    <span className="text-xs text-muted-foreground">Broker：{selectedOrder.broker}</span>
                  )}
                </div>
                <div className="grid gap-3 lg:grid-cols-2">
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">提货点</h3>
                    <ul className="space-y-2">
                      {selectedOrder.stops
                        .filter((stop) => stop.stop_type === "pickup")
                        .map((stop, index) => (
                          <StopCard key={`${stop.company_name}-${index}`} stop={stop} index={index} />
                        ))}
                    </ul>
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold text-sky-700 dark:text-sky-400">卸货点</h3>
                    <ul className="space-y-2">
                      {selectedOrder.stops
                        .filter((stop) => stop.stop_type === "drop")
                        .map((stop, index) => (
                          <StopCard key={`${stop.company_name}-${index}`} stop={stop} index={index} />
                        ))}
                    </ul>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex min-h-24 items-center justify-center text-sm text-muted-foreground">
                请先选择陆运订单
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="space-y-4 rounded-xl border bg-card p-4">
        <div>
          <h2 className="text-sm font-semibold">第二步：填写排车信息</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            这里只维护调度属性；订单货物和站点信息仍在陆运订单中维护。
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div>
            <Label className="text-xs text-muted-foreground">排车日期</Label>
            <Input type="date" className="mt-1.5" value={values.dispatch_date} onChange={(event) => update("dispatch_date", event.target.value)} />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">车牌/标识</Label>
            <Input className="mt-1.5" value={values.truck} onChange={(event) => update("truck", event.target.value)} />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">司机</Label>
            <Input className="mt-1.5" value={values.driver} onChange={(event) => update("driver", event.target.value)} />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Trailer</Label>
            <Input className="mt-1.5" value={values.trailer} onChange={(event) => update("trailer", event.target.value)} />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">运输类型</Label>
            <Select value={values.haul_type} onValueChange={(value) => update("haul_type", value as FormValues["haul_type"])}>
              <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="long_haul">长途</SelectItem>
                <SelectItem value="local">本地</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">排车状态</Label>
            <Select value={values.status} onValueChange={(value) => update("status", value as FormValues["status"])}>
              <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="planned">已排车</SelectItem>
                <SelectItem value="dispatched">已出车</SelectItem>
                <SelectItem value="completed">已完成</SelectItem>
                <SelectItem value="cancelled">已取消</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">排序</Label>
            <Input type="number" min="0" className="mt-1.5" value={values.sort_order} onChange={(event) => update("sort_order", event.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs text-muted-foreground">Todo</Label>
            <Textarea rows={2} className="mt-1.5" value={values.todo_note} onChange={(event) => update("todo_note", event.target.value)} />
          </div>
          <label className="flex items-end gap-2 pb-2 text-sm">
            <input type="checkbox" className="size-4 accent-primary" checked={values.todo_done} onChange={(event) => update("todo_done", event.target.checked)} />
            Todo 已完成
          </label>
        </div>

        <div className="flex justify-end gap-2 border-t pt-4">
          <Button type="button" variant="outline" onClick={() => router.push("/dashboard/land-dispatches")}>取消</Button>
          <Button disabled={saving || !selectedOrder}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            {saving ? "正在保存..." : "保存排车"}
          </Button>
        </div>
      </section>
    </form>
  )
}
