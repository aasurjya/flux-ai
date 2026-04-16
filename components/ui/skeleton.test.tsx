import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Skeleton } from "./skeleton";

describe("Skeleton", () => {
  it("renders a div with pulse animation class", () => {
    const html = renderToStaticMarkup(<Skeleton className="h-4 w-32" />);
    expect(html).toContain("animate-pulse");
    expect(html).toContain("h-4 w-32");
  });

  it("renders with rounded-md by default", () => {
    const html = renderToStaticMarkup(<Skeleton />);
    expect(html).toContain("rounded-md");
  });

  it("renders as a span when inline is true", () => {
    const html = renderToStaticMarkup(<Skeleton inline />);
    expect(html).toMatch(/^<span /);
  });
});
