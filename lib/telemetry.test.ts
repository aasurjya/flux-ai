import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

// We need dynamic import so the env var is already set before the module reads it
let telemetry: typeof import("./telemetry");

describe("telemetry", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "flux-telemetry-"));
    process.env.FLUX_TELEMETRY_DIR = tmpDir;
    telemetry = await import("./telemetry");
  });

  afterEach(async () => {
    delete process.env.FLUX_TELEMETRY_DIR;
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("incrementing a counter persists to disk", async () => {
    await telemetry.track("project.created");
    await telemetry.track("project.created");
    const counters = await telemetry.readCounters();
    expect(counters["project.created"]).toBe(2);
  });

  it("tracks different event names independently", async () => {
    await telemetry.track("bom.edited");
    await telemetry.track("export.downloaded");
    await telemetry.track("export.downloaded");
    await telemetry.track("export.downloaded");
    const counters = await telemetry.readCounters();
    expect(counters["bom.edited"]).toBe(1);
    expect(counters["export.downloaded"]).toBe(3);
  });

  it("readCounters returns empty object when no events tracked yet", async () => {
    const counters = await telemetry.readCounters();
    expect(counters).toEqual({});
  });

  it("does not throw when disk write fails (telemetry is best-effort)", async () => {
    // Point to a non-existent nested directory — mkdir is lazy but
    // if somehow fs.writeFile still fails, track must not throw.
    process.env.FLUX_TELEMETRY_DIR = "/tmp/__nonexistent__/deep/nested";
    await expect(telemetry.track("some.event")).resolves.toBeUndefined();
  });
});
