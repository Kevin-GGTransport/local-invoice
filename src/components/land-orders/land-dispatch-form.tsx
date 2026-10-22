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
  const [orderSearch, setOrderSearch] = React.useState("")
  const [values, setValues] = React.useState<FormValues>(emptyValues)
  const [loading, setLoading] = React.useState(true)
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
            const stops = Array.isArray(related.land_order_stops)
              ? related.land_order_stops
              : []
            const pickup = stops.find((stop) => text((stop as LandDispatchRecord).stop_type) === "pickup") as
              | LandDispatchRecord
              | undefined
            selectedOrder = {
              id: text(record.land_order_id),
              identifier: text(related.identifier) || null,
              load_number: text(related.load_number) || null,
              pickup_dates: pickup ? dateText(pickup.stop_date) : "",
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
            const stops = Array.isArray(detail.land_order_stops) ? detail.land_order_stops : []
            const pickup = stops.find(
              (stop) => text((stop as LandDispatchRecord).stop_type) === "pickup"
            ) as LandDispatchRecord | undefined
            selectedOrder = {
              id: text(detail.id),
              identifier: text(detail.identifier) || null,
              load_number: text(detail.load_number) || null,
              pickup_dates: pickup ? dateText(pickup.stop_date) : "",
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
    <form onSubmit={handleSubmit} className="grid gap-4 rounded-xl border bg-card p-4 sm:grid-cols-2 xl:grid-cols-4">
      <div className="sm:col-span-2 xl:col-span-2">
        <Label className="text-xs text-muted-foreground">陆运订单</Label>
        <div className="mt-1.5 flex gap-2">
          <Input
            aria-label="搜索陆运订单"
            placeholder="输入 Load# / 站点 / 标识后搜索"
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
          onValueChange={(value) => update("land_order_id", value)}
          disabled={isEditing}
        >
          <SelectTrigger className="mt-1.5">
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
      <div className="col-span-full flex justify-end gap-2 border-t pt-4">
        <Button type="button" variant="outline" onClick={() => router.push("/dashboard/land-dispatches")}>取消</Button>
        <Button disabled={saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          {saving ? "正在保存..." : "保存排车"}
        </Button>
      </div>
    </form>
  )
}
