import { auth } from "@/lib/auth"
import { ReconciliationTable } from "./reconciliation-table"

export default async function ReconciliationPage({ searchParams }: { searchParams: Promise<{ invoice_id?: string }> }) {
  const session = await auth()
  const { invoice_id } = await searchParams
  const initialInvoiceId = invoice_id && /^[1-9]\d*$/.test(invoice_id) ? invoice_id : ""
  return <ReconciliationTable isAdmin={session?.user?.role === "admin"} initialInvoiceId={initialInvoiceId} />
}
