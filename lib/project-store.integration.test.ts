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
});
