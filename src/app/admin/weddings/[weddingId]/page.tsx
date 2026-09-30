import { AdminAuthGate } from "@/components/admin/admin-auth-gate";
import { AdminHeader } from "@/components/admin/admin-header";
import { WeddingDashboard } from "@/components/admin/wedding-dashboard";

export default async function WeddingAdminPage({ params }: { params: Promise<{ weddingId: string }> }) {
  const { weddingId } = await params;
  return <AdminAuthGate><AdminHeader /><WeddingDashboard weddingId={weddingId} /></AdminAuthGate>;
}
