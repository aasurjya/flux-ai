import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CircuitGraph } from "./circuit-graph";
import type { CircuitBlock } from "@/types/project";

const blocks: CircuitBlock[] = [
  { id: "usb-in", label: "USB-C", kind: "interface", connections: ["pwr-prot"] },
  { id: "pwr-prot", label: "Input protect", kind: "protection", connections: ["usb-in", "3v3"] },
  { id: "3v3", label: "3V3 Rail", kind: "power", connections: ["pwr-prot", "mcu"] },
  { id: "mcu", label: "ESP32-S3", kind: "processing", connections: ["3v3", "imu"] },
  { id: "imu", label: "IMU", kind: "sensor", connections: ["mcu"] }
];

describe("CircuitGraph", () => {
  it("renders one rect per block with the block label", () => {
    const html = renderToStaticMarkup(<CircuitGraph blocks={blocks} />);
    const rectCount = (html.match(/<rect /g) ?? []).length;
    expect(rectCount).toBe(blocks.length);
    for (const block of blocks) {
      expect(html).toContain(block.label);
    }
  });

  it("renders kind labels under each block", () => {
    const html = renderToStaticMarkup(<CircuitGraph blocks={blocks} />);
    expect(html).toContain("interface");
    expect(html).toContain("processing");
    expect(html).toContain("sensor");
  });

  it("renders one path per unique edge (5 blocks, 4 unique edges)", () => {
    const html = renderToStaticMarkup(<CircuitGraph blocks={blocks} />);
    // 5 blocks chained linearly: usb ↔ prot, prot ↔ 3v3, 3v3 ↔ mcu, mcu ↔ imu
    // = 4 unique edges (bidirectional noise filtered out)
    // Connection paths all reference the arrow marker, so count by that
    const connectionPaths = html.match(/marker-end="url\(#arrow\)"/g) ?? [];
    expect(connectionPaths.length).toBe(4);
  });

  it("renders an arrow marker for directed connections", () => {
    const html = renderToStaticMarkup(<CircuitGraph blocks={blocks} />);
    // React lowercases JSX camelCase SVG attributes in serialisation
    expect(html).toContain('id="arrow"');
    expect(html).toContain('marker-end="url(#arrow)"');
  });

  it("renders an empty-state panel when blocks is empty", () => {
    const html = renderToStaticMarkup(<CircuitGraph blocks={[]} />);
    expect(html).not.toContain("<svg");
    expect(html).toMatch(/run the ai generation pipeline/i);
  });

  it("has accessible aria-label describing node and edge counts", () => {
    const html = renderToStaticMarkup(<CircuitGraph blocks={blocks} />);
    expect(html).toMatch(/aria-label="Circuit block diagram with 5 blocks and 4 connections"/);
  });

  it("sizes viewBox to fit all blocks (no clipping)", () => {
    const html = renderToStaticMarkup(<CircuitGraph blocks={blocks} />);
    const viewBox = html.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
    expect(viewBox).not.toBeNull();
    const [, wStr, hStr] = viewBox!;
    const w = parseFloat(wStr);
    const h = parseFloat(hStr);
    expect(w).toBeGreaterThan(400);
    expect(h).toBeGreaterThan(64);
  });

  it("renders a legend listing only the block kinds actually present", () => {
    const html = renderToStaticMarkup(<CircuitGraph blocks={blocks} />);
    // Blocks in the test fixture: interface, protection, power, processing, sensor
    // Not present: storage, analog — should NOT appear in legend
    const legendRegion = html.slice(html.indexOf("Legend"));
    expect(legendRegion).toContain("interface");
    expect(legendRegion).toContain("protection");
    expect(legendRegion).toContain("power");
    expect(legendRegion).toContain("processing");
    expect(legendRegion).toContain("sensor");
    expect(legendRegion).not.toContain(">storage<");
    expect(legendRegion).not.toContain(">analog<");
  });
});
