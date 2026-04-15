import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { GET } from "./route";

async function makeParams(jobId: string) {
  return { params: Promise.resolve({ jobId }) };
}

describe("GET /api/exports/[jobId]/download", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "flux-dl-"));
    process.env.FLUX_EXPORTS_DIR = tmpDir;
  });

  afterEach(async () => {
    delete process.env.FLUX_EXPORTS_DIR;
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("streams the zip with correct headers when the file exists", async () => {
    const jobId = "export-abc123";
    const zipBytes = Buffer.from("PK\u0003\u0004fake-zip-bytes");
    await fs.writeFile(path.join(tmpDir, `${jobId}.zip`), zipBytes);

    const res = await GET(new Request("http://localhost/x") as unknown as Parameters<typeof GET>[0], await makeParams(jobId));

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/zip");
    expect(res.headers.get("Content-Length")).toBe(String(zipBytes.length));
    expect(res.headers.get("Content-Disposition")).toContain(`${jobId}.zip`);
    const body = Buffer.from(await res.arrayBuffer());
    expect(body).toEqual(zipBytes);
  });

  it("returns 404 when the zip does not exist", async () => {
    const res = await GET(new Request("http://localhost/x") as unknown as Parameters<typeof GET>[0], await makeParams("missing-job"));
    expect(res.status).toBe(404);
  });

  it("rejects malicious jobId with 400", async () => {
    const res = await GET(new Request("http://localhost/x") as unknown as Parameters<typeof GET>[0], await makeParams("../../../etc/passwd"));
    expect(res.status).toBe(400);
  });
});
