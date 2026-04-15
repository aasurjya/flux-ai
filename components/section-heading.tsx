interface SectionHeadingProps {
  eyebrow?: string;
  title: string;
  description: string;
}

export function SectionHeading({ eyebrow, title, description }: SectionHeadingProps) {
  return (
    <div className="space-y-3">
      {eyebrow ? <p className="text-sm font-medium uppercase tracking-[0.24em] text-primary">{eyebrow}</p> : null}
      <div className="space-y-2">
        <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">{title}</h2>
        <p className="max-w-3xl text-base text-muted-foreground sm:text-lg">{description}</p>
      </div>
    </div>
  );
}
