#!/usr/bin/env node
/**
 * JARVIS autonomous-mode Stop hook.
 *
 * Blocking: exit 0 allows the session to stop; exit 1 forces Claude to
 * keep working until the gates pass. Controlled by JARVIS_BUDGET.json:
 *   enableStopGate: false   → always allow stop (default during bootstrap)
 *   enableStopGate: true    → enforce all gates
 *
 * Gates (when enabled):
 *   1. No JARVIS_BLOCKED.md file
 *   2. npx vitest run --coverage passes with coverage ≥ minCoveragePercent
 *   3. npm run build exits 0
 *   4. npx playwright test passes
 */

const { execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const PROJECT = path.resolve(__dirname, "..", "..");
const BUDGET_PATH = path.join(PROJECT, "JARVIS_BUDGET.json");
const BLOCKED_PATH = path.join(PROJECT, "JARVIS_BLOCKED.md");

function readBudget() {
  try {
    return JSON.parse(fs.readFileSync(BUDGET_PATH, "utf8"));
  } catch {
    return { enableStopGate: false, minCoveragePercent: 80 };
  }
}

function run(cmd, timeoutMs) {
  return execSync(cmd, {
    cwd: PROJECT,
    encoding: "utf8",
    timeout: timeoutMs,
    stdio: ["ignore", "pipe", "pipe"]
  });
}

function fail(reason) {
  // Write to stderr so Claude sees the reason and can act on it
  process.stderr.write(`JARVIS STOP BLOCKED: ${reason}\n`);
  process.exit(1);
}

function main() {
  const budget = readBudget();

  if (!budget.enableStopGate) {
    // Gate disabled — allow stop
    process.exit(0);
  }

  // Gate 1: no blocked file
  if (fs.existsSync(BLOCKED_PATH)) {
    fail("JARVIS_BLOCKED.md exists — unresolved tasks");
  }

  // Gate 2: tests + coverage
  try {
    const out = run("npx vitest run --coverage 2>&1", 120_000);
    const minCov = budget.minCoveragePercent ?? 80;
    const match = out.match(/All files\s*\|\s*([\d.]+)/);
    const cov = match ? parseFloat(match[1]) : null;
    if (cov === null) {
      fail("coverage report not parseable from vitest output");
    }
    if (cov < minCov) {
      fail(`coverage ${cov}% < ${minCov}%`);
    }
  } catch (e) {
    fail(`tests failed: ${String(e.message).slice(0, 400)}`);
  }

  // Gate 3: build
  try {
    run("npm run build 2>&1", 180_000);
  } catch (e) {
    fail(`build failed: ${String(e.message).slice(0, 400)}`);
  }

  // Gate 4: E2E (allow skipping if explicitly disabled)
  if (budget.skipE2EOnStop !== true) {
    try {
      run("npx playwright test 2>&1", 240_000);
    } catch (e) {
      fail(`playwright failed: ${String(e.message).slice(0, 400)}`);
    }
  }

  process.exit(0);
}

main();
