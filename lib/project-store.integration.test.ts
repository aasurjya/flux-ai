import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  createProject,
  generateProject,
  getProjectById,
  createExportJob,
  runExportJob,
  getExportFilePath
} from "./project-store";
import { deleteProject, importProject } from "./project-store";
import { createStubAiClient } from "./ai/stub-client";

describe("generateProject integration (stub AI client)", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "flux-test-"));
    process.env.FLUX_PROJECTS_FILE = path.join(tmpDir, "projects.json");
    process.env.FLUX_EXPORTS_DIR = path.join(tmpDir, "exports");
  });

  afterEach(async () => {
    delete process.env.FLUX_PROJECTS_FILE;
    delete process.env.FLUX_EXPORTS_DIR;
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("runs the full pipeline end-to-end and produces structured outputs", async () => {
    const created = await createProject({
      name: "Test Board",
      prompt: "USB-C powered sensor board",
      constraints: ["2-layer board"],
      preferredParts: []
    });

    const generated = await generateProject({
      projectId: created.id,
      client: createStubAiClient()
    });

    expect(generated.status).toBe("review");
    expect(generated.outputs.requirements.length).toBeGreaterThanOrEqual(2);
    expect(generated.outputs.architectureBlocks).toBeDefined();
    expect(generated.outputs.architectureBlocks!.length).toBeGreaterThanOrEqual(2);
    expect(generated.outputs.architecture.length).toBeGreaterThanOrEqual(2);
    expect(generated.outputs.bom.length).toBeGreaterThanOrEqual(1);

    // A generation revision was prepended
    expect(generated.revisions[0].title).toBe("AI generation");

    // Persistence — reading back should return the same project
    const reread = await getProjectById(created.id);
    expect(reread?.outputs.architectureBlocks?.length).toEqual(generated.outputs.architectureBlocks!.length);
  });

  it("pauses on clarifying questions and does not advance downstream stages", async () => {
    const created = await createProject({
      name: "Ambiguous Board",
      prompt: "sensor thing",
      constraints: [],
      preferredParts: []
    });

    // Custom client that returns questions at the clarify step
    const client = createStubAiClient();
    const original = client.callStructured;
    client.callStructured = async (opts) => {
      if (opts.schemaName === "emit_clarifying_questions") {
        return opts.schema.parse({
          questions: ["Is this battery-powered or wall-powered only?"]
        });
      }
      return original.call(client, opts);
    };

    const paused = await generateProject({ projectId: created.id, client });

    expect(paused.status).toBe("generating");
    expect(paused.clarifyingQuestions).toEqual([
      "Is this battery-powered or wall-powered only?"
    ]);
    // Architecture/BOM/validations NOT populated on pause
    expect(paused.outputs.architectureBlocks).toBeUndefined();
  });

  it("resumes from a paused state when clarifyingAnswers are provided", async () => {
    const created = await createProject({
      name: "Resume Board",
      prompt: "sensor thing",
      constraints: [],
      preferredParts: []
    });

    // Don't pause this time — use default stub (returns no questions)
    const finished = await generateProject({
      projectId: created.id,
      clarifyingAnswers: { "Any question?": "Battery-powered" },
      client: createStubAiClient()
    });

    expect(finished.status).toBe("review");
    expect(finished.clarifyingQuestions).toBeUndefined();
    expect(finished.clarifyingAnswers).toEqual({ "Any question?": "Battery-powered" });
  });
});

describe("runExportJob integration", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "flux-export-"));
    process.env.FLUX_PROJECTS_FILE = path.join(tmpDir, "projects.json");
    process.env.FLUX_EXPORTS_DIR = path.join(tmpDir, "exports");
  });

  afterEach(async () => {
    delete process.env.FLUX_PROJECTS_FILE;
    delete process.env.FLUX_EXPORTS_DIR;
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  async function seedGeneratedProject() {
    const created = await createProject({
      name: "Export Board",
      prompt: "USB-C MCU board",
      constraints: ["2-layer"],
      preferredParts: []
    });
    await generateProject({ projectId: created.id, client: createStubAiClient() });
    return created.id;
  }

  it("produces a completed job with a zip on disk", async () => {
    const projectId = await seedGeneratedProject();
    const { job } = await createExportJob({ projectId, format: "kicad" });

    const completed = await runExportJob(projectId, job.id);

    expect(completed.status).toBe("completed");
    expect(completed.downloadUrl).toBe(`/api/exports/${job.id}/download`);
    const stat = await fs.stat(getExportFilePath(job.id));
    expect(stat.size).toBeGreaterThan(500);
  });

  it("fails gracefully with an error message when architecture is missing", async () => {
    // Create project but DON'T generate → no architectureBlocks
    const created = await createProject({
      name: "No Arch",
      prompt: "p",
      constraints: [],
      preferredParts: []
    });
    const { job } = await createExportJob({ projectId: created.id, format: "kicad" });

    const failed = await runExportJob(created.id, job.id);

    expect(failed.status).toBe("failed");
    expect(failed.error).toMatch(/architecture/i);
    // No zip should have been written
    await expect(fs.stat(getExportFilePath(job.id))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("throws on unknown projectId or jobId", async () => {
    await expect(runExportJob("nope", "x")).rejects.toThrow(/not found/i);
    const projectId = await seedGeneratedProject();
    await expect(runExportJob(projectId, "missing-job")).rejects.toThrow(/not found/i);
  });

  it("concurrent createProject calls never lose data (mutex serialises writes)", async () => {
    // Without the mutex, 20 parallel createProject() calls would each
    // read the same baseline, build a project, and the last write wins.
    // Result: the store ends up with ONE project instead of 20.
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        createProject({
          name: `Concurrent ${i}`,
          prompt: "test",
          constraints: [],
          preferredParts: []
        })
      )
    );
    expect(results).toHaveLength(20);
    // Every id should be distinct (project id uniqueness check)
    const uniqueIds = new Set(results.map((p) => p.id));
    expect(uniqueIds.size).toBe(20);
  });

  it("readStoredProjects drops schema-invalid entries instead of crashing", async () => {
    // Write a file containing one valid + one broken record
    const fs = await import("node:fs/promises");
    const valid = await createProject({
      name: "Valid",
      prompt: "p",
      constraints: [],
      preferredParts: []
    });
    const { getProjects } = await import("./project-store");
    const filePath = process.env.FLUX_PROJECTS_FILE!;
    const current = JSON.parse(await fs.readFile(filePath, "utf8"));
    current.push({ id: "broken", name: "", /* missing required fields */ });
    await fs.writeFile(filePath, JSON.stringify(current));

    const all = await getProjects();
    expect(all.some((p) => p.id === valid.id)).toBe(true);
    expect(all.some((p) => p.id === "broken")).toBe(false);
  });

  it("deleteProject removes project and unlinks its export zips", async () => {
    const created = await createProject({
      name: "To Delete",
      prompt: "p",
      constraints: [],
      preferredParts: []
    });
    await generateProject({ projectId: created.id, client: createStubAiClient() });
    const { job } = await createExportJob({ projectId: created.id, format: "kicad" });
    await runExportJob(created.id, job.id);

    const fs = await import("node:fs/promises");
    // Zip exists before delete
    await expect(fs.stat(getExportFilePath(job.id))).resolves.toBeDefined();

    const removed = await deleteProject(created.id);
    expect(removed).toBe(true);

    // Project is gone
    const { getProjectById } = await import("./project-store");
    expect(await getProjectById(created.id)).toBeUndefined();
    // Zip has been cleaned up
    await expect(fs.stat(getExportFilePath(job.id))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("deleteProject returns false for unknown id", async () => {
    const removed = await deleteProject("never-existed");
    expect(removed).toBe(false);
  });

  it("importProject assigns a fresh id even when source id matches existing", async () => {
    const created = await createProject({
      name: "Original",
      prompt: "p",
      constraints: [],
      preferredParts: []
    });
    // Export-like payload reusing the same id
    const source = { ...created, updatedAt: new Date().toISOString() };
    const imported = await importProject(source);
    expect(imported.id).not.toBe(created.id);
    expect(imported.id.startsWith("original")).toBe(true);
  });

  it("importProject regenerates revision ids to prevent collisions", async () => {
    const created = await createProject({
      name: "Src",
      prompt: "p",
      constraints: [],
      preferredParts: []
    });
    const oldRevId = created.revisions[0].id;
    const imported = await importProject(created);
    expect(imported.revisions[0].id).not.toBe(oldRevId);
    expect(imported.revisions[0].id.startsWith("rev-")).toBe(true);
  });

  it("importProject strips exportJobs from the source", async () => {
    const source: Parameters<typeof importProject>[0] = {
      id: "any",
      name: "With Jobs",
      prompt: "p",
      status: "exported",
      updatedAt: new Date().toISOString(),
      constraints: [],
      outputs: {
        requirements: [],
        architecture: [],
        bom: [],
        validations: [],
        exportReady: false
      },
      revisions: [
        {
          id: "rev-stale",
          title: "seed",
          description: "",
          createdAt: new Date().toISOString(),
          changes: []
        }
      ],
      exportJobs: [
        {
          id: "export-stale",
          projectId: "any",
          status: "completed",
          format: "kicad",
          createdAt: new Date().toISOString(),
          logs: ["old"]
        }
      ]
    };
    const imported = await importProject(source);
    expect(imported.exportJobs).toEqual([]);
  });

  it("garbage-collects old export zips to keep disk bounded", async () => {
    const projectId = await seedGeneratedProject();

    // Run 7 exports in sequence, with small delays so createdAt sort is
    // deterministic (ISO string sort → millisecond precision).
    const jobIds: string[] = [];
    for (let i = 0; i < 7; i++) {
      await new Promise((r) => setTimeout(r, 3));
      const { job } = await createExportJob({ projectId, format: "kicad" });
      jobIds.push(job.id);
      await runExportJob(projectId, job.id);
    }

    const stats = await Promise.all(
      jobIds.map(async (id) => {
        try {
          await fs.stat(getExportFilePath(id));
          return true;
        } catch {
          return false;
        }
      })
    );

    // Latest job is always kept. Of the earlier completed ones, only the
    // 3 most recent survive. With 7 total: latest + 3 kept = 4 files;
    // the 3 oldest have been GC'd.
    const present = stats.filter(Boolean).length;
    expect(present).toBeLessThanOrEqual(4);
    // The very latest must exist
    expect(stats[6]).toBe(true);
    // The very oldest must be gone
    expect(stats[0]).toBe(false);
  });
});
