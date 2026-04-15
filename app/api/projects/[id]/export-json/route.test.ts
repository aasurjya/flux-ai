import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { GET } from "./route";
import { createProject } from "@/lib/project-store";

async function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("GET /api/projects/[id]/export-json", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "flux-exp-"));
    process.env.FLUX_PROJECTS_FILE = path.join(tmpDir, "projects.json");
  });

  afterEach(async () => {
    delete process.env.FLUX_PROJECTS_FILE;
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("returns 200 + full ProjectSummary as downloaded JSON", async () => {
    const created = await createProject({
      name: "Export Me",
      prompt: "p",
      constraints: [],
      preferredParts: []
    });

    const res = await GET(
      new Request("http://x") as unknown as Parameters<typeof GET>[0],
      await makeParams(created.id)
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/json");
    expect(res.headers.get("Content-Disposition")).toContain(`${created.id}.flux.json`);
    const body = JSON.parse(await res.text());
    expect(body.id).toBe(created.id);
    expect(body.name).toBe("Export Me");
    expect(body.revisions).toHaveLength(1);
  });

  it("returns 404 for unknown project id", async () => {
    const res = await GET(
      new Request("http://x") as unknown as Parameters<typeof GET>[0],
      await makeParams("does-not-exist-999")
    );
    expect(res.status).toBe(404);
  });

  it("rejects malformed id with 400 (no path traversal)", async () => {
    const res = await GET(
      new Request("http://x") as unknown as Parameters<typeof GET>[0],
      await makeParams("../../etc/passwd")
    );
    expect(res.status).toBe(400);
  });
});
