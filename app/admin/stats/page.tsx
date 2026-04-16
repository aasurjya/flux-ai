import { cookies } from "next/headers";
import { readCounters } from "@/lib/telemetry";
import { isTokenValid } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

/**
 * /admin/stats — read-only dashboard of telemetry counters.
 *
 * Gated behind the `FLUX_ADMIN_TOKEN` env var. Authentication is via
 * an HttpOnly cookie set by /admin/login — the token never appears in
 * the URL, browser history, or referrer headers.
 */
export default async function AdminStatsPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("flux_admin_token")?.value ?? "";
  const expected = process.env.FLUX_ADMIN_TOKEN ?? "";
  if (!isTokenValid(token, expected)) {
    redirect("/admin/login");
  }

  const counters = await readCounters();
  const events = Object.entries(counters).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="container py-16">
      <h1 className="mb-4 text-2xl font-bold text-foreground">Admin: Telemetry Counters</h1>
      <p className="mb-8 text-sm text-muted-foreground">
        Local file-based counters. No network telemetry. Resets on data wipe.
      </p>
      {events.length === 0 ? (
        <p className="text-sm text-muted-foreground">No events tracked yet.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {events.map(([name, count]) => (
            <Card key={name} className="border-border/60 bg-card/60">
              <CardHeader className="pb-2">
                <CardDescription className="font-mono text-xs">{name}</CardDescription>
                <CardTitle className="text-3xl tabular-nums">{count}</CardTitle>
              </CardHeader>
              <CardContent />
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
