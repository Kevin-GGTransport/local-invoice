import { auth } from "@/lib/auth"
import { CashierReconciliationWorkspace } from "./cashier-reconciliation-workspace"

export default async function ReconciliationPage({ searchParams }: { searchParams: Promise<{ invoice_id?: string }> }) {
  const session = await auth()
  const { invoice_id } = await searchParams
  const initialInvoiceId = invoice_id && /^[1-9]\d*$/.test(invoice_id) ? invoice_id : ""
  return <CashierReconciliationWorkspace isAdmin={session?.user?.role === "admin"} initialInvoiceId={initialInvoiceId} />
}
