import { LandOrderForm } from "@/components/land-orders/land-order-form"

export default function NewLandOrderPage() {
  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div>
        <h1 className="text-lg font-semibold">新建陆运订单</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          录入订单主信息和多个提货/交货站点，保存后自动进入路程规划表。
        </p>
      </div>
      <LandOrderForm />
    </div>
  )
}
