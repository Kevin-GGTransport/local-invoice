import { LandDispatchForm } from "@/components/land-orders/land-dispatch-form"

export default async function EditLandDispatchPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div>
        <h1 className="text-lg font-semibold">编辑排车</h1>
        <p className="mt-1 text-sm text-muted-foreground">调整排车日期、车辆、司机和 Todo。</p>
      </div>
      <LandDispatchForm dispatchId={id} />
    </div>
  )
}
