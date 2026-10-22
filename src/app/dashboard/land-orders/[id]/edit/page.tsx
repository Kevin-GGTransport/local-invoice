import { LandOrderForm } from "@/components/land-orders/land-order-form"

export default async function EditLandOrderPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div>
        <h1 className="text-lg font-semibold">编辑陆运订单</h1>
        <p className="mt-1 text-sm text-muted-foreground">调整订单信息或增删、排序提货/交货站点。</p>
      </div>
      <LandOrderForm orderId={id} />
    </div>
  )
}
