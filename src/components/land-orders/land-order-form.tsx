"use client"

import React from "react"
import { useRouter } from "next/navigation"
import { ArrowDown, ArrowUp, Loader2, Plus, Save, Trash2 } from "lucide-react"
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
import { MAX_LAND_ORDER_STOPS } from "@/lib/land-orders/validation"

type StopForm = {
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

type OrderForm = {
  identifier: string
  operating_company: string
  dispatch_person: string
  broker: string
  load_number: string
  quantity: string
  pallet_positions: string
  weight_lbs: string
  price: string
  load_type: "full" | "partial"
  delivery_person: string
  status: "draft" | "planned" | "completed" | "cancelled"
  note: string
  stops: StopForm[]
}

type LandOrderRecord = {
  [key: string]: unknown
}

function text(value: unknown): string {
  if (value == null) return ""
  return String(value)
}

function dateText(value: unknown): string {
  const valueText = text(value)
  return valueText.slice(0, 10)
}

function emptyStop(stopType: "pickup" | "drop"): StopForm {
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

function emptyOrder(): OrderForm {
  return {
    identifier: "",
    operating_company: "",
    dispatch_person: "",
    broker: "",
    load_number: "",
    quantity: "",
    pallet_positions: "",
    weight_lbs: "",
    price: "",
    load_type: "full",
    delivery_person: "",
    status: "draft",
    note: "",
    stops: [emptyStop("pickup"), emptyStop("drop")],
  }
}

function orderFromRecord(record: LandOrderRecord): OrderForm {
  const rawStops = Array.isArray(record.land_order_stops) ? record.land_order_stops : []
  return {
    identifier: text(record.identifier),
    operating_company: text(record.operating_company),
    dispatch_person: text(record.dispatch_person),
    broker: text(record.broker),
    load_number: text(record.load_number),
    quantity: text(record.quantity),
    pallet_positions: text(record.pallet_positions),
    weight_lbs: text(record.weight_lbs),
    price: text(record.price),
    load_type: (text(record.load_type) || "full") as OrderForm["load_type"],
    delivery_person: text(record.delivery_person),
    status: (text(record.status) || "draft") as OrderForm["status"],
    note: text(record.note),
    stops: rawStops.length
      ? rawStops.map((rawStop) => {
          const stop = rawStop as LandOrderRecord
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
            time_type: text(stop.time_type) || "FCFS",
            reference_numbers: text(stop.reference_numbers),
            stop_note: text(stop.stop_note),
          }
        })
      : [emptyStop("pickup"), emptyStop("drop")],
  }
}

function Field({
  label,
  children,
  className,
}: {
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={`min-w-0 space-y-1.5 ${className ?? ""}`}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}

export function LandOrderForm({ orderId }: { orderId?: string }) {
  const router = useRouter()
  const isEditing = orderId != null
  const [values, setValues] = React.useState<OrderForm>(emptyOrder)
  const [loading, setLoading] = React.useState(orderId != null)
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (!orderId) return
    let cancelled = false
    void (async () => {
      try {
        const order = await fetchJson<LandOrderRecord>(`/api/land-orders/${orderId}`)
        if (cancelled) return
        setValues(orderFromRecord(order))
      } catch (error) {
        toast.error(getRequestErrorMessage(error, "加载陆运订单失败"))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [orderId])

  const update = <K extends keyof OrderForm>(key: K, value: OrderForm[K]) => {
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  const updateStop = (index: number, key: keyof StopForm, value: string) => {
    setValues((prev) => ({
      ...prev,
      stops: prev.stops.map((stop, stopIndex) =>
        stopIndex === index ? { ...stop, [key]: value } : stop
      ),
    }))
  }

  const moveStop = (index: number, offset: -1 | 1) => {
    setValues((prev) => {
      const target = index + offset
      if (target < 0 || target >= prev.stops.length) return prev
      const stops = [...prev.stops]
      const [moved] = stops.splice(index, 1)
      stops.splice(target, 0, moved)
      return { ...prev, stops }
    })
  }

  const addStop = () => {
    if (values.stops.length >= MAX_LAND_ORDER_STOPS) {
      toast.error(`站点最多 ${MAX_LAND_ORDER_STOPS} 个`)
      return
    }
    setValues((prev) => ({ ...prev, stops: [...prev.stops, emptyStop("pickup")] }))
  }

  const removeStop = (index: number) => {
    setValues((prev) => {
      const stop = prev.stops[index]
      const sameTypeCount = prev.stops.filter((item) => item.stop_type === stop.stop_type).length
      if (sameTypeCount <= 1 || prev.stops.length <= 2) return prev
      return { ...prev, stops: prev.stops.filter((_, i) => i !== index) }
    })
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!values.operating_company) {
      toast.error("请填写运营公司")
      return
    }
    if (!values.stops.some((stop) => stop.stop_type === "pickup")) {
      toast.error("至少保留一个提货点")
      return
    }
    if (!values.stops.some((stop) => stop.stop_type === "drop")) {
      toast.error("至少保留一个交货点")
      return
    }

    setSaving(true)
    try {
      const payload = {
        ...values,
        stops: values.stops.map((stop) => ({
          ...stop,
          time_from: stop.time_from || null,
          time_to: stop.time_to || null,
        })),
      }
      if (isEditing) {
        await fetchJson(`/api/land-orders/${orderId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
        toast.success("陆运订单已保存")
      } else {
        await fetchJson("/api/land-orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
        toast.success("陆运订单已创建")
      }
      router.push("/dashboard/land-orders")
      router.refresh()
    } catch (error) {
      toast.error(getRequestErrorMessage(error, "保存陆运订单失败"))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-64 items-center justify-center rounded-xl border bg-card text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        正在加载陆运订单...
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
      <section className="space-y-4 rounded-xl border bg-card p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">订单主信息</h2>
          <span className="text-xs text-muted-foreground">{isEditing ? "编辑" : "新建"}</span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="运营公司">
            <Input
              value={values.operating_company}
              onChange={(e) => update("operating_company", e.target.value)}
            />
          </Field>
          <Field label="标识">
            <Input value={values.identifier} onChange={(e) => update("identifier", e.target.value)} />
          </Field>
          <Field label="Dispatch / 提货人">
            <Input value={values.dispatch_person} onChange={(e) => update("dispatch_person", e.target.value)} />
          </Field>
          <Field label="Broker">
            <Input value={values.broker} onChange={(e) => update("broker", e.target.value)} />
          </Field>
          <Field label="Load #">
            <Input value={values.load_number} onChange={(e) => update("load_number", e.target.value)} />
          </Field>
          <Field label="数量">
            <Input type="number" min="0" step="0.01" value={values.quantity} onChange={(e) => update("quantity", e.target.value)} />
          </Field>
          <Field label="板位">
            <Input type="number" min="0" step="0.01" value={values.pallet_positions} onChange={(e) => update("pallet_positions", e.target.value)} />
          </Field>
          <Field label="重量(lbs)">
            <Input type="number" min="0" step="0.01" value={values.weight_lbs} onChange={(e) => update("weight_lbs", e.target.value)} />
          </Field>
          <Field label="价格">
            <Input type="number" min="0" step="0.01" value={values.price} onChange={(e) => update("price", e.target.value)} />
          </Field>
          <Field label="装载类型">
            <Select value={values.load_type} onValueChange={(value) => update("load_type", value as OrderForm["load_type"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="full">Full</SelectItem>
                <SelectItem value="partial">Partial</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="交货人">
            <Input value={values.delivery_person} onChange={(e) => update("delivery_person", e.target.value)} />
          </Field>
          <Field label="状态">
            <Select value={values.status} onValueChange={(value) => update("status", value as OrderForm["status"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">草稿</SelectItem>
                <SelectItem value="confirmed">已确认</SelectItem>
                <SelectItem value="completed">已完成</SelectItem>
                <SelectItem value="cancelled">已取消</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>

        <Field label="备注">
          <Textarea rows={3} value={values.note} onChange={(e) => update("note", e.target.value)} />
        </Field>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4">
          <div>
            <h2 className="text-sm font-semibold">提货 / 交货站点</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              按实际执行顺序录入；可新增多个提货点和交货点。
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={addStop}
            disabled={values.stops.length >= MAX_LAND_ORDER_STOPS}
          >
            <Plus className="mr-2 h-4 w-4" /> 新增站点
          </Button>
        </div>

        <div className="space-y-3">
          {values.stops.map((stop, index) => (
            <article key={index} className="rounded-xl border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
                <div className="flex items-center gap-2">
                  <span className="flex size-7 items-center justify-center rounded-full border text-xs font-semibold">
                    {index + 1}
                  </span>
                  <Select
                    value={stop.stop_type}
                    onValueChange={(value) => updateStop(index, "stop_type", value)}
                  >
                    <SelectTrigger className="h-8 w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pickup">提货</SelectItem>
                      <SelectItem value="drop">交货</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-1">
                  <Button type="button" variant="outline" size="icon" className="size-8" disabled={index === 0} onClick={() => moveStop(index, -1)}>
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button type="button" variant="outline" size="icon" className="size-8" disabled={index === values.stops.length - 1} onClick={() => moveStop(index, 1)}>
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button type="button" variant="outline" size="icon" className="size-8 text-destructive" onClick={() => removeStop(index)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="grid gap-3 pt-3 sm:grid-cols-2 xl:grid-cols-4">
                <Field label="公司名" className="sm:col-span-2">
                  <Input value={stop.company_name} onChange={(e) => updateStop(index, "company_name", e.target.value)} />
                </Field>
                <Field label="地址" className="sm:col-span-2">
                  <Input value={stop.address} onChange={(e) => updateStop(index, "address", e.target.value)} />
                </Field>
                <Field label="城市">
                  <Input value={stop.city} onChange={(e) => updateStop(index, "city", e.target.value)} />
                </Field>
                <Field label="州">
                  <Input value={stop.state} onChange={(e) => updateStop(index, "state", e.target.value)} />
                </Field>
                <Field label="Zip Code">
                  <Input value={stop.zip_code} onChange={(e) => updateStop(index, "zip_code", e.target.value)} />
                </Field>
                <Field label="日期">
                  <Input type="date" value={stop.stop_date} onChange={(e) => updateStop(index, "stop_date", e.target.value)} />
                </Field>
                <Field label="Time From">
                  <Input type="time" value={stop.time_from} onChange={(e) => updateStop(index, "time_from", e.target.value)} />
                </Field>
                <Field label="Time To">
                  <Input type="time" value={stop.time_to} onChange={(e) => updateStop(index, "time_to", e.target.value)} />
                </Field>
                <Field label="时间类型">
                  <Input value={stop.time_type} onChange={(e) => updateStop(index, "time_type", e.target.value)} />
                </Field>
                <Field label={stop.stop_type === "pickup" ? "PU#" : "DEL#"} className="sm:col-span-2">
                  <Textarea rows={2} value={stop.reference_numbers} onChange={(e) => updateStop(index, "reference_numbers", e.target.value)} />
                </Field>
                <Field label="站点备注" className="sm:col-span-2">
                  <Textarea rows={2} value={stop.stop_note} onChange={(e) => updateStop(index, "stop_note", e.target.value)} />
                </Field>
              </div>
            </article>
          ))}
        </div>

        <div className="flex flex-wrap justify-end gap-2 rounded-xl border bg-card p-4">
          <Button type="button" variant="outline" onClick={() => router.push("/dashboard/land-orders")}>
            取消
          </Button>
          <Button disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            {saving ? "正在保存..." : "保存订单"}
          </Button>
        </div>
      </section>
    </form>
  )
}
