// Guardrail checks for the analysis engine against the fictional sample data.
// Run: node scripts/verify-engine.mjs
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const E = require(join(root, "web/js/engine.js"));
const src = readFileSync(join(root, "web/data/sample-data.js"), "utf8");
const data = JSON.parse(src.slice(src.indexOf("=") + 1).trim().replace(/;\s*$/, ""));

const a = E.analyze(data);
let passed = 0;
const check = (name, fn) => { fn(); passed++; console.log("✓", name); };

check("dataset is flagged as sample data", () => assert.equal(a.isSampleData, true));

check("no usage claims for subscriptions without an imported report", () => {
  for (const s of a.subscriptions.filter((x) => x.usage.status !== "imported")) {
    assert.equal(s.usage.activeIds, undefined, s.id);
    for (const r of a.recommendations.filter((r) => r.subscriptionId === s.id)) {
      assert.notEqual(r.basis, "usage_import", `${r.id} uses usage basis without data`);
      assert.ok(!r.evidence.some((e) => e.type === "usage_import"), `${r.id} cites usage evidence without import`);
    }
  }
});

check("every usage-based recommendation cites its import file", () => {
  for (const r of a.recommendations.filter((r) => r.basis === "usage_import")) {
    const s = a.subById[r.subscriptionId];
    assert.ok(r.evidence.some((e) => e.type === "usage_import" && e.source === s.usage.filename), r.id);
  }
});

check("FlowBoard is flagged for review with 14 active of 60 seats", () => {
  const r = a.recommendations.find((r) => r.id === "rightsize:flowb");
  assert.ok(r, "missing FlowBoard recommendation");
  assert.equal(a.subById.flowb.usage.observedActive, 14);
  assert.equal(r.confidence.level, "High");
  assert.ok(r.estimate.low > 0 && r.estimate.high >= r.estimate.low);
});

check("short (30-day) DataLens export yields Low confidence", () => {
  const r = a.recommendations.find((r) => r.id === "rightsize:datal");
  assert.ok(r);
  assert.equal(r.confidence.level, "Low");
});

check("subscriptions without usage get a data request, not an estimate", () => {
  const r = a.recommendations.find((r) => r.id === "usage-gap:taskt");
  assert.ok(r);
  assert.equal(r.estimate, null);
});

check("recommendations carry a no-automatic-action guardrail", () => {
  for (const r of a.recommendations) assert.match(r.guardrail, /does not change/);
});

check("engine exposes no account/subscription mutation functions", () => {
  const names = Object.keys(E).join(" ");
  assert.doesNotMatch(names, /cancel|disable|deprovision|revoke|delete/i);
});

check("savings stay estimated until verified with an amount", () => {
  const s0 = E.summarizeSavings(a.recommendations, {});
  assert.equal(s0.verified, 0);
  const s1 = E.summarizeSavings(a.recommendations, { "rightsize:flowb": { status: "verified", verifiedAmount: 9900 } });
  assert.equal(s1.verified, 9900);
  assert.ok(s1.estimatedOpen[1] < s0.estimatedOpen[1]);
});

check("anomalies found: DataLens unit price, MeetSpace & FlowBoard seat growth", () => {
  const k = a.anomalies.map((x) => `${x.subscriptionId}:${x.kind}`);
  for (const want of ["datal:unit_price", "meet:seat_growth", "flowb:seat_growth"]) assert.ok(k.includes(want), want);
});

check("SurveyNest notice-passed and SignFlow missing-contract alerts", () => {
  assert.ok(a.renewalAlerts.some((x) => x.subscriptionId === "surv" && x.kind === "notice_passed"));
  assert.ok(a.renewalAlerts.some((x) => x.subscriptionId === "signf" && x.kind === "missing_contract"));
});

check("CSV parser rejects files without required columns", () => {
  assert.ok(E.parseUsageCsv("name,foo\na,b").errors.length > 0);
  assert.equal(E.parseUsageCsv("email,last_active_date\nx@y.example,2026-09-01").rows.length, 1);
});

console.log(`\n${passed} checks passed. ${a.recommendations.length} recommendations, ${a.renewalAlerts.length} alerts, ${a.anomalies.length} anomalies.`);
console.log(a.recommendations.map((r) => `  ${r.id} [${r.confidence.level}] ${r.estimate ? E.money(r.estimate.low) + "–" + E.money(r.estimate.high) : "no estimate"}`).join("\n"));
