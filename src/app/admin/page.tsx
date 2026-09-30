import { AdminAuthGate } from "@/components/admin/admin-auth-gate";
import { AdminHeader } from "@/components/admin/admin-header";
import { WeddingSelector } from "@/components/admin/wedding-selector";

export default function AdminPage() {
  return <AdminAuthGate><AdminHeader /><WeddingSelector /></AdminAuthGate>;
}
