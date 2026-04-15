/**
 * Format an ISO timestamp as a relative string ("2h ago") or a short
 * absolute date for older items. Used on project cards + the workspace
 * header after we moved from the literal "Updated just now" string to
 * real ISO timestamps.
 */
export function formatRelative(iso: string, now: Date = new Date()): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    // Fallback for legacy records that still have "Updated just now"
    return iso;
  }
  const diffMs = now.getTime() - parsed.getTime();
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  // Older than a week — show "MMM D" like "Apr 15"
  return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
