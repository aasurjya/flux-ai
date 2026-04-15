import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="border-b border-border/60 bg-background/70 backdrop-blur">
      <div className="container flex h-16 items-center justify-between">
        <Link href="/" className="text-lg font-semibold tracking-tight text-foreground">
          flux.ai
        </Link>
        <nav className="flex items-center gap-6 text-sm text-muted-foreground">
          <Link href="/projects" className="transition hover:text-foreground">
            Projects
          </Link>
          <Link href="/projects/new" className="transition hover:text-foreground">
            New Project
          </Link>
        </nav>
      </div>
    </header>
  );
}
