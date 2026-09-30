export function adminDestination(next: string | null): string {
  return next?.startsWith("/admin") && !next.startsWith("//") ? next : "/admin";
}

export function unauthenticatedAdminRedirect(pathname: string): string {
  return `/admin/login?next=${encodeURIComponent(pathname)}`;
}

export async function signInAdmin(
  auth: { signInWithPassword: (credentials: { email: string; password: string }) => Promise<{ error: unknown }> },
  email: string,
  password: string,
) {
  const result = await auth.signInWithPassword({ email: email.trim(), password });
  if (result.error) throw new Error("Email or password is incorrect.");
}
