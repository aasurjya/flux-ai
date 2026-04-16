import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isTokenValid } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * /admin/login — sets an HttpOnly cookie with the admin token.
 *
 * This replaces the ?token=... query param pattern which leaked the
 * token to browser history, referrer headers, and server access logs.
 * The cookie is HttpOnly + SameSite=Strict so it can't be read by
 * client-side JS or sent cross-origin.
 */

async function loginAction(formData: FormData) {
  "use server";
  const token = String(formData.get("token") ?? "");
  const expected = process.env.FLUX_ADMIN_TOKEN ?? "";

  if (!isTokenValid(token, expected)) {
    redirect("/admin/login?error=invalid");
  }

  const cookieStore = await cookies();
  cookieStore.set("flux_admin_token", token, {
    httpOnly: true,
    sameSite: "strict",
    path: "/admin",
    maxAge: 60 * 60 * 24 // 24 hours
  });

  redirect("/admin/stats");
}

export default async function AdminLoginPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const hasError = params.error === "invalid";

  return (
    <div className="container flex min-h-[60vh] items-center justify-center py-16">
      <Card className="w-full max-w-sm border-border/60 bg-card/60">
        <CardHeader>
          <CardTitle>Admin Access</CardTitle>
          <CardDescription>Enter the FLUX_ADMIN_TOKEN to view telemetry counters.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={loginAction} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="token" className="text-sm font-medium text-muted-foreground">
                Admin token
              </label>
              <Input
                id="token"
                name="token"
                type="password"
                required
                placeholder="Enter admin token"
                autoComplete="off"
              />
            </div>
            {hasError && (
              <p className="text-sm text-rose-400" role="alert">
                Invalid token. Check your FLUX_ADMIN_TOKEN environment variable.
              </p>
            )}
            <Button type="submit" className="w-full">
              Sign in
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
