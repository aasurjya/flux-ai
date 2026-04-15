import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { POST } from "./route";
import { createProject } from "@/lib/project-store";

describe("POST /api/projects/import", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "flux-imp-"));
    process.env.FLUX_PROJECTS_FILE = path.join(tmpDir, "projects.json");
  });

  afterEach(async () => {
    delete process.env.FLUX_PROJECTS_FILE;
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  function makeRequest(body: unknown, headers: Record<string, string> = {}): NextRequest {
    const json = typeof body === "string" ? body : JSON.stringify(body);
    return new Request("http://x/api/projects/import", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: json
    }) as unknown as NextRequest;
  }

  it("returns 400 for invalid JSON body", async () => {
    const res = await POST(makeRequest("not json {{{"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid json/i);
  });

  it("returns 400 with a generic issueCount when schema validation fails (no path leak)", async () => {
    const res = await POST(makeRequest({ id: "x" })); // missing name/prompt/outputs/etc
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/schema/i);
    expect(body.issueCount).toBeGreaterThan(0);
    // Do not leak internal schema paths to unauthenticated callers
    expect(body.issues).toBeUndefined();
  });

  it("returns 413 when Content-Length exceeds MAX_BYTES", async () => {
    const res = await POST(
      makeRequest({}, { "content-length": String(6 * 1024 * 1024) })
    );
    expect(res.status).toBe(413);
  });

  it("returns 201 with a fresh id for valid import", async () => {
    const created = await createProject({
      name: "Source Board",
      prompt: "sample",
      constraints: [],
      preferredParts: []
    });
    // Simulate a round-trip: caller exports created, modifies nothing, re-imports
    const res = await POST(makeRequest(created));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBeDefined();
    expect(body.id).not.toBe(created.id); // collision-safe
  });
});

// `NextRequest` is just a structural alias for the global Request used by
// the route handler. Importing the real type pulls Next.js runtime; the
// above structural cast is sufficient for unit tests.
import type { NextRequest } from "next/server";
