import { describe, it, expect } from "vitest";
import { buildUserMessage } from "./build-user-message";

describe("buildUserMessage", () => {
  it("renders a brief + constraints + instruction", () => {
    const msg = buildUserMessage({
      sections: [
        { title: "Customer brief", text: "USB-C MCU board" },
        { title: "Constraints", items: ["2-layer", "SMD only"] }
      ],
      instruction: "Emit requirements via the tool."
    });
    expect(msg).toContain("# Customer brief");
    expect(msg).toContain("USB-C MCU board");
    expect(msg).toContain("# Constraints");
    expect(msg).toContain("- 2-layer");
    expect(msg).toContain("- SMD only");
    expect(msg).toContain("Emit requirements via the tool.");
  });

  it("renders emptyLabel when items array is empty", () => {
    const msg = buildUserMessage({
      sections: [
        { title: "Constraints", items: [], emptyLabel: "(none specified)" }
      ],
      instruction: "Go."
    });
    expect(msg).toContain("(none specified)");
    expect(msg).not.toContain("- ");
  });

  it("renders text sections verbatim", () => {
    const msg = buildUserMessage({
      sections: [
        { title: "Customer brief", text: "  Build a sensor hub  " }
      ],
      instruction: "Done."
    });
    // text is trimmed
    expect(msg).toContain("Build a sensor hub");
  });

  it("omits sections with no content when emptyLabel is not set", () => {
    const msg = buildUserMessage({
      sections: [
        { title: "Brief", text: "hello" },
        { title: "Optional", items: [] }
      ],
      instruction: "End."
    });
    expect(msg).not.toContain("# Optional");
  });

  it("handles mixed text and item sections", () => {
    const msg = buildUserMessage({
      sections: [
        { title: "Brief", text: "prompt here" },
        { title: "Requirements", items: ["req1", "req2"] },
        { title: "Clarifying answers", text: "Q: what?\n  A: this" }
      ],
      instruction: "Emit now."
    });
    expect(msg).toContain("# Brief");
    expect(msg).toContain("# Requirements");
    expect(msg).toContain("- req1");
    expect(msg).toContain("# Clarifying answers");
    expect(msg).toContain("Q: what?");
  });
});
