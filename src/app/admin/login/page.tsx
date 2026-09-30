import { Suspense } from "react";
import { AdminLoginForm } from "@/components/admin/login-form";

export default function AdminLoginPage() {
  return <main className="admin-login-page"><Suspense fallback={<div className="admin-state">Loading…</div>}><AdminLoginForm /></Suspense></main>;
}
