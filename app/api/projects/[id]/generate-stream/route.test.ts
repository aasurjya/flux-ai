import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { NextRequest } from "next/server";
import { GET } from "./route";
import { createProject } from "@/lib/project-store";

function req() {
  return new NextRequest("http://x/api/projects/pid/generate-stream");
}

async function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

async function readAllEvents(body: ReadableStream<Uint8Array>): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
  }
  return buffer;
}

describe("GET /api/projects/[id]/generate-stream", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "flux-sse-"));
    process.env.FLUX_PROJECTS_FILE = path.join(tmpDir, "projects.json");
    process.env.FLUX_EXPORTS_DIR = path.join(tmpDir, "exports");
  });

  afterEach(async () => {
    delete process.env.FLUX_PROJECTS_FILE;
    delete process.env.FLUX_EXPORTS_DIR;
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("rejects project ids that don't match the safe pattern (defence-in-depth)", async () => {
    const res = await GET(req(), await params("../../../etc/passwd"));
    expect(res.status).toBe(400);
  });

  it("returns text/event-stream content-type and streams stage events for a real project", async () => {
    const project = await createProject({
      name: "SSE Test",
      prompt: "ESP32 board",
      constraints: [],
      preferredParts: []
    });

    const res = await GET(req(), await params(project.id));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/text\/event-stream/);
    expect(res.headers.get("Cache-Control")).toMatch(/no-cache/);

    const text = await readAllEvents(res.body!);
    // Must emit at least one running + completed event per stage
    expect(text).toMatch(/event: stage/);
    expect(text).toMatch(/"stage":"requirements","status":"running"/);
    expect(text).toMatch(/"stage":"requirements","status":"completed"/);
    expect(text).toMatch(/"stage":"bom","status":"completed"/);
    expect(text).toMatch(/"stage":"validation","status":"completed"/);
    // And close with a done event
    expect(text).toMatch(/event: done/);
  });

  it("closes with an error event if the project does not exist", async () => {
    const res = await GET(req(), await params("does-not-exist"));
    expect(res.status).toBe(200); // SSE always 200 — error surfaces as event
    const text = await readAllEvents(res.body!);
    expect(text).toMatch(/event: error/);
    expect(text).toMatch(/Project not found/);
  });
});
