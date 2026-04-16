interface SkeletonProps {
  className?: string;
  /** Render as <span> instead of <div> for inline use. */
  inline?: boolean;
}

export function Skeleton({ className = "", inline }: SkeletonProps) {
  const Tag = inline ? "span" : "div";
  return (
    <Tag
      aria-hidden
      className={`animate-pulse rounded-md bg-muted/50 ${className}`}
    />
  );
}
