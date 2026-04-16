import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { PATCH } from "./route";
import { createProject, generateProject, getProjectById } from "@/lib/project-store";
import { createStubAiClient } from "@/lib/ai/stub-client";

async function params(id: string, designator: string) {
  return { params: Promise.resolve({ id, designator }) };
}

function bodyRequest(json: unknown): Request {
  return new Request("http://x", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(json)
  });
}

describe("PATCH /api/projects/[id]/bom/[designator]", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "flux-bom-patch-"));
    process.env.FLUX_PROJECTS_FILE = path.join(tmpDir, "projects.json");
    process.env.FLUX_EXPORTS_DIR = path.join(tmpDir, "exports");
  });

  afterEach(async () => {
    delete process.env.FLUX_PROJECTS_FILE;
    delete process.env.FLUX_EXPORTS_DIR;
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  async function seedProject() {
    const p = await createProject({
      name: "Patch Test",
      prompt: "board",
      constraints: [],
      preferredParts: []
    });
    // Generate so there's a real BOM to patch
    await generateProject({ projectId: p.id, client: createStubAiClient() });
    return p.id;
  }

  it("200s with the updated project and records a revision", async () => {
    const id = await seedProject();
    const before = await getProjectById(id);
    const targetDesignator = before!.outputs.bom[0].designator;
    const originalRevs = before!.revisions.length;

    const res = await PATCH(
      bodyRequest({ status: "selected", name: "Updated part name" }) as Parameters<typeof PATCH>[0],
      await params(id, targetDesignator)
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.bom).toBeDefined();
    const patched = body.bom.find((b: { designator: string }) => b.designator === targetDesignator);
    expect(patched.status).toBe("selected");
    expect(patched.name).toBe("Updated part name");

    const after = await getProjectById(id);
    expect(after!.revisions.length).toBe(originalRevs + 1);
    expect(after!.revisions[0].title).toMatch(new RegExp(`edited ${targetDesignator}`, "i"));
  });

  it("400s on invalid body (e.g. quantity negative)", async () => {
    const id = await seedProject();
    const before = await getProjectById(id);
    const targetDesignator = before!.outputs.bom[0].designator;

    const res = await PATCH(
      bodyRequest({ quantity: -5 }) as Parameters<typeof PATCH>[0],
      await params(id, targetDesignator)
    );
    expect(res.status).toBe(400);
  });

  it("404s when project doesn't exist", async () => {
    const res = await PATCH(
      bodyRequest({ status: "selected" }) as Parameters<typeof PATCH>[0],
      await params("no-such-project", "U1")
    );
    expect(res.status).toBe(404);
  });

  it("404s when designator doesn't match any BOM item in the project", async () => {
    const id = await seedProject();
    const res = await PATCH(
      bodyRequest({ status: "selected" }) as Parameters<typeof PATCH>[0],
      await params(id, "Z999")
    );
    expect(res.status).toBe(404);
  });

  it("rejects malformed id with 400 (no path traversal)", async () => {
    const res = await PATCH(
      bodyRequest({ status: "selected" }) as Parameters<typeof PATCH>[0],
      await params("../../etc", "U1")
    );
    expect(res.status).toBe(400);
  });

  it("accepts a structured `value` edit and round-trips it on read", async () => {
    const id = await seedProject();
    const before = await getProjectById(id);
    const targetDesignator = before!.outputs.bom[0].designator;

    const res = await PATCH(
      bodyRequest({ value: "100nF" }) as Parameters<typeof PATCH>[0],
      await params(id, targetDesignator)
    );
    expect(res.status).toBe(200);
    const after = await getProjectById(id);
    const patched = after!.outputs.bom.find((b) => b.designator === targetDesignator);
    expect(patched!.value).toBe("100nF");
    // Revision records the value change
    expect(after!.revisions[0].changes.join(" ")).toMatch(/value:/);
  });

  it("clearing value via null removes the field", async () => {
    const id = await seedProject();
    const before = await getProjectById(id);
    const targetDesignator = before!.outputs.bom[0].designator;

    // First set a value
    await PATCH(
      bodyRequest({ value: "100nF" }) as Parameters<typeof PATCH>[0],
      await params(id, targetDesignator)
    );
    // Then clear it
    const res = await PATCH(
      bodyRequest({ value: null }) as Parameters<typeof PATCH>[0],
      await params(id, targetDesignator)
    );
    expect(res.status).toBe(200);
    const after = await getProjectById(id);
    const patched = after!.outputs.bom.find((b) => b.designator === targetDesignator);
    expect(patched!.value).toBeUndefined();
  });

  it("does not allow changing designator via PATCH (PATCH is scoped to designator)", async () => {
    const id = await seedProject();
    const before = await getProjectById(id);
    const targetDesignator = before!.outputs.bom[0].designator;

    const res = await PATCH(
      bodyRequest({ designator: "HIJACKED" }) as Parameters<typeof PATCH>[0],
      await params(id, targetDesignator)
    );
    // Either rejected with 400 OR silently ignored — test for BOTH no-hijack outcomes
    const after = await getProjectById(id);
    expect(after!.outputs.bom.find((b) => b.designator === "HIJACKED")).toBeUndefined();
    expect(after!.outputs.bom.find((b) => b.designator === targetDesignator)).toBeDefined();
    // Response is either 200 with unchanged designator or 400 rejecting the field
    expect([200, 400]).toContain(res.status);
  });
});
