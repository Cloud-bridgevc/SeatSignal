// Offline tests: no AWS or Bedrock calls are made.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

process.env.AWS_REGION ||= "us-east-1";
const require = createRequire(import.meta.url);
const Engine = require("../shared/engine.cjs");
const { validateNarrative } = await import("../shared/bedrock.mjs");
const { factSheet, templateNarrative } = await import("../functions/scheduled-checks/index.mjs");

const src = readFileSync(new URL("../../web/data/sample-data.js", import.meta.url), "utf8");
const data = JSON.parse(src.slice(src.indexOf("=") + 1).trim().replace(/;\s*$/, ""));
const a = Engine.analyze(data);
const rec = (id) => a.recommendations.find((r) => r.id === id);

test("fact sheet omits usage details when usage is not imported", () => {
  const r = rec("usage-gap:taskt");
  const f = factSheet(r, a.subById.taskt);
  assert.deepEqual(f.usage, { status: "not_imported" });
  assert.equal(f.estimate, null);
});

test("fact sheet for FlowBoard carries the imported report and counts", () => {
  const f = factSheet(rec("rightsize:flowb"), a.subById.flowb);
  assert.equal(f.usage.report, "flowboard_members_2026Q3.csv");
  assert.equal(f.usage.activeAssignedUsers, 14);
  assert.match(f.estimate.status, /unverified/);
});

test("validator accepts a narrative that only uses facts", () => {
  const f = factSheet(rec("rightsize:flowb"), a.subById.flowb);
  const text = "FlowBoard has 60 seats and renews on 2026-11-28. The flowboard_members_2026Q3.csv report shows 14 assigned users active. Reducing seats could save an estimated $10,560 to $11,352 per year, unverified. The Marketing owner should decide before 2026-10-29.";
  assert.equal(validateNarrative(text, f), null);
});

test("validator rejects invented figures", () => {
  const f = factSheet(rec("rightsize:flowb"), a.subById.flowb);
  assert.match(validateNarrative("FlowBoard could save $25,000 per year.", f), /unsupported figure/);
});

test("validator rejects usage claims when usage is not imported", () => {
  const f = factSheet(rec("usage-gap:taskt"), a.subById.taskt);
  assert.match(validateNarrative("Most TaskTrack users are inactive.", f), /usage language/);
  assert.equal(validateNarrative("TaskTrack utilization is unknown because no usage report has been imported.", f), null);
});

test("validator rejects claims of automatic action", () => {
  const f = factSheet(rec("departed:meet"), a.subById.meet);
  assert.match(validateNarrative("SeatSignal will disable the accounts.", f), /automatic action/);
});

test("template fallback restates the guardrail", () => {
  assert.match(templateNarrative(rec("rightsize:flowb"), a.subById.flowb), /does not change user accounts/);
});
