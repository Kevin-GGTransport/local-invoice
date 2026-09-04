import { auth } from "@/lib/auth"
import { ReconciliationTable } from "./reconciliation-table"

export default async function ReconciliationPage() {
  const session = await auth()
  return <ReconciliationTable isAdmin={session?.user?.role === "admin"} />
}
