import { Suspense } from "react"
import { LandDispatchForm } from "@/components/land-orders/land-dispatch-form"

export default function NewLandDispatchPage() {
  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div>
        <h1 className="text-lg font-semibold">新增排车</h1>
        <p className="mt-1 text-sm text-muted-foreground">选择已录入的陆运订单，并安排调度信息。</p>
      </div>
      <Suspense>
        <LandDispatchForm />
      </Suspense>
    </div>
  )
}
