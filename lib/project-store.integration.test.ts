import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { createProject, generateProject, getProjectById } from "./project-store";
import { createStubAiClient } from "./ai/stub-client";

describe("generateProject integration (stub AI client)", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "flux-test-"));
    process.env.FLUX_PROJECTS_FILE = path.join(tmpDir, "projects.json");
  });

  afterEach(async () => {
    delete process.env.FLUX_PROJECTS_FILE;
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
