"use client"

import React from "react"
import { useRouter } from "next/navigation"
import { ArrowDown, ArrowUp, Loader2, Plus, Save, ScanLine, Trash2, X } from "lucide-react"
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
import { recognizeSocImage, validateSocImage } from "@/lib/land-orders/soc-ocr"
import { mergeSocIntoOrder, parseSocText } from "@/lib/land-orders/soc-parser"
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
  load_type: "" | "full" | "partial"
  delivery_person: string
  status: "draft" | "confirmed" | "completed" | "cancelled"
  note: string
  stops: StopForm[]
}

type LandOrderRecord = {
  [key: string]: unknown
}

type SocRecognitionState = "idle" | "success" | "error"

function text(value: unknown): string {
  if (value == null) return ""
  return String(value)
}

function dateText(value: unknown): string {
  const valueText = text(value)
  return valueText.slice(0, 10)
}

function socStageText(status: string): string {
  if (/loading tesseract core/i.test(status)) return "加载识别引擎"
  if (/loading language/i.test(status)) return "加载语言包"
  if (/initializing/i.test(status)) return "初始化"
  if (/recognizing/i.test(status)) return "正在识别"
  return "准备识别"
}

function formatFileSize(size: number): string {
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)}MB`
  return `${Math.max(1, Math.round(size / 1024))}KB`
}

function SocImagePreview({ file }: { file: File }) {
  const previewRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const element = previewRef.current
    if (!element) return
    const objectUrl = URL.createObjectURL(file)
    element.style.backgroundImage = `url(${objectUrl})`
    return () => {
      element.style.backgroundImage = ""
      URL.revokeObjectURL(objectUrl)
    }
  }, [file])

  return (
    <div
      ref={previewRef}
      role="img"
      aria-label="SOC 图片预览"
      className="size-16 shrink-0 rounded-lg border bg-muted bg-cover bg-center"
    />
  )
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
    load_type: "",
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
  const socFileInputRef = React.useRef<HTMLInputElement>(null)
  const [socFile, setSocFile] = React.useState<File | null>(null)
  const [socRecognizing, setSocRecognizing] = React.useState(false)
  const [socProgress, setSocProgress] = React.useState(0)
  const [socStage, setSocStage] = React.useState("准备识别")
  const [socState, setSocState] = React.useState<SocRecognitionState>("idle")
  const [socSummary, setSocSummary] = React.useState("")
  const [socConfidence, setSocConfidence] = React.useState<number | null>(null)
  const [socWarnings, setSocWarnings] = React.useState<string[]>([])

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

  const clearSocFile = () => {
    if (socFileInputRef.current) socFileInputRef.current.value = ""
    setSocFile(null)
    setSocRecognizing(false)
    setSocProgress(0)
    setSocStage("准备识别")
    setSocState("idle")
    setSocSummary("")
    setSocConfidence(null)
    setSocWarnings([])
  }

  const recognizeSoc = async (file: File) => {
    setSocRecognizing(true)
    setSocState("idle")
    setSocProgress(0)
    setSocStage("准备识别")
    setSocSummary("")
    setSocConfidence(null)
    setSocWarnings([])

    try {
      const result = await recognizeSocImage(file, ({ status, progress }) => {
        setSocStage(socStageText(status))
        setSocProgress(Math.round(progress * 100))
      })
      const parsed = parseSocText(result.text)
      setValues((prev) => mergeSocIntoOrder(prev, parsed))
      setSocConfidence(result.confidence)
      setSocWarnings(parsed.warnings)

      const pickupCount = parsed.stops.filter((stop) => stop.stop_type === "pickup").length
      const dropCount = parsed.stops.filter((stop) => stop.stop_type === "drop").length
      setSocSummary(
        parsed.stops.length
          ? `识别到 ${pickupCount} 个提货点、${dropCount} 个卸货点`
          : "未识别到站点信息"
      )
      setSocState("success")
      toast.success("SOC 识别完成，已填入空字段")
    } catch (error) {
      setSocState("error")
      setSocWarnings(["识别失败，请重试"])
      toast.error(
        error instanceof Error && error.message
          ? `SOC 识别失败：${error.message}`
          : "SOC 识别失败，请重试"
      )
    } finally {
      setSocRecognizing(false)
      setSocProgress(100)
    }
  }

  const handleSocFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const error = validateSocImage(file)
    if (error) {
      event.target.value = ""
      setSocFile(null)
      setSocSummary("")
      setSocConfidence(null)
      setSocProgress(0)
      setSocState("error")
      setSocWarnings([error])
      toast.error(error)
      return
    }
    setSocFile(file)
    void recognizeSoc(file)
  }

  const moveStop = (index: number, offset: -1 | 1) => {
    setValues((prev) => {
      const target = index + offset
      if (target < 0 || target >= prev.stops.length) return prev
      if (prev.stops[target].stop_type !== prev.stops[index].stop_type) return prev
      const stops = [...prev.stops]
      const [moved] = stops.splice(index, 1)
      stops.splice(target, 0, moved)
      return { ...prev, stops }
    })
  }

  const addStop = (stopType: "pickup" | "drop") => {
    if (values.stops.length >= MAX_LAND_ORDER_STOPS) {
      toast.error(`站点最多 ${MAX_LAND_ORDER_STOPS} 个`)
      return
    }
    setValues((prev) => {
      const stops = [...prev.stops, emptyStop(stopType)]
      return {
        ...prev,
        stops: [
          ...stops.filter((stop) => stop.stop_type === "pickup"),
          ...stops.filter((stop) => stop.stop_type === "drop"),
        ],
      }
    })
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
      const orderedStops = [
        ...values.stops.filter((stop) => stop.stop_type === "pickup"),
        ...values.stops.filter((stop) => stop.stop_type === "drop"),
      ]
      const payload = {
        ...values,
        load_type: values.load_type || "full",
        stops: orderedStops.map((stop) => ({
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

  const stopEntries = values.stops.map((stop, index) => ({ stop, index }))
  const pickupEntries = stopEntries.filter((entry) => entry.stop.stop_type === "pickup")
  const dropEntries = stopEntries.filter((entry) => entry.stop.stop_type === "drop")

  const renderStop = (
    { stop, index }: { stop: StopForm; index: number },
    numberWithinType: number,
    totalOfType: number
  ) => (
    <article key={index} className="rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
        <div className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-full border text-xs font-semibold">
            {numberWithinType}
          </span>
          <span
            className={`rounded-full px-2 py-1 text-xs font-medium ${
              stop.stop_type === "pickup"
                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                : "bg-sky-500/10 text-sky-700 dark:text-sky-400"
            }`}
          >
            {stop.stop_type === "pickup" ? "提货点" : "卸货点"}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-8"
            disabled={numberWithinType === 1}
            onClick={() => moveStop(index, -1)}
          >
            <ArrowUp className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-8"
            disabled={numberWithinType === totalOfType}
            onClick={() => moveStop(index, 1)}
          >
            <ArrowDown className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-8 text-destructive"
            onClick={() => removeStop(index)}
          >
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
  )

  return (
    <form onSubmit={handleSubmit} className="grid gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
      {!isEditing && (
        <section className="space-y-3 rounded-xl border bg-card p-4 xl:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <ScanLine className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">SOC 识别</h2>
            </div>
            <div className="flex items-center gap-2">
              <input
                ref={socFileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={handleSocFileChange}
                disabled={socRecognizing}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={socRecognizing}
                onClick={() => socFileInputRef.current?.click()}
              >
                {socFile ? "重新选择" : "选择图片"}
              </Button>
              {socFile && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={socRecognizing}
                  onClick={clearSocFile}
                >
                  <X className="mr-2 h-4 w-4" />
                  清除
                </Button>
              )}
            </div>
          </div>

          {socFile ? (
            <div className="flex flex-wrap items-start gap-3">
              <SocImagePreview file={socFile} />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <p className="max-w-full truncate text-sm font-medium">{socFile.name}</p>
                  <span className="text-xs text-muted-foreground">
                    {formatFileSize(socFile.size)}
                  </span>
                </div>

                {socRecognizing ? (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      {socStage} {socProgress}%
                    </div>
                    <div
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={socProgress}
                      aria-label="SOC 识别进度"
                      className="h-1.5 overflow-hidden rounded-full bg-muted"
                    >
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${socProgress}%` }}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <p
                      className={
                        socState === "error"
                          ? "text-xs text-destructive"
                          : "text-xs text-muted-foreground"
                      }
                    >
                      {socState === "idle"
                        ? "等待识别"
                        : socSummary ||
                          (socState === "error" ? "识别失败，请核对或重新上传" : "识别完成")}
                      {socConfidence != null ? ` · 置信度 ${Math.round(socConfidence)}%` : ""}
                    </p>
                    {socWarnings.length > 0 && (
                      <div className="max-h-20 overflow-y-auto text-xs text-amber-600 dark:text-amber-400">
                        {socWarnings.map((warning) => (
                          <p key={warning}>· {warning}</p>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              支持 PNG / JPG / WEBP，最大 10MB；图片只在浏览器本地识别，不会上传。
            </p>
          )}
        </section>
      )}

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
              <SelectTrigger><SelectValue placeholder="Full" /></SelectTrigger>
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
            <h2 className="text-sm font-semibold">订单站点</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              先录入全部提货点，再录入全部卸货点；排车时会自动带出这些站点。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => addStop("pickup")} disabled={values.stops.length >= MAX_LAND_ORDER_STOPS}>
              <Plus className="mr-2 h-4 w-4" /> 提货点
            </Button>
            <Button type="button" variant="outline" onClick={() => addStop("drop")} disabled={values.stops.length >= MAX_LAND_ORDER_STOPS}>
              <Plus className="mr-2 h-4 w-4" /> 卸货点
            </Button>
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">提货点</h3>
            {pickupEntries.map((entry, i) => renderStop(entry, i + 1, pickupEntries.length))}
          </div>
          <div className="space-y-3 border-t pt-4">
            <h3 className="text-sm font-semibold text-sky-700 dark:text-sky-400">卸货点</h3>
            {dropEntries.map((entry, i) => renderStop(entry, i + 1, dropEntries.length))}
          </div>
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
