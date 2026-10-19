// Scheduled checks (EventBridge, daily). For each organization:
//   1. load records from PostgreSQL
//   2. run the deterministic analysis engine (renewal risk, anomalies, recommendations)
//   3. draft narratives for new/changed recommendations via Bedrock (validated, template fallback)
//   4. upsert alerts and recommendations; supersede ones that no longer apply
//
// This function only READS from source records and WRITES to SeatSignal's own tables.
// Its IAM role has no access to vendor admin APIs or identity providers, so it cannot
// disable accounts or cancel subscriptions, by construction.
import { createRequire } from "node:module";
import { getPool, tx } from "../../shared/db.mjs";
import { loadOrgDataset } from "../../shared/load.mjs";
import { draftNarrative } from "../../shared/bedrock.mjs";

const require = createRequire(import.meta.url);
const Engine = require("../../shared/engine.cjs");

export async function handler(event = {}) {
  const asOf = event.asOf || new Date().toISOString().slice(0, 10);
  const pool = await getPool();
  const orgs = (await pool.query("SELECT id FROM organizations")).rows;
  const summary = [];
  for (const { id: orgId } of orgs) {
    const client = await pool.connect();
    let data;
    try { data = await loadOrgDataset(client, orgId, asOf); } finally { client.release(); }
    const analysis = Engine.analyze(data, { asOf });
    const stats = await persist(orgId, data, analysis);
    summary.push({ orgId, ...stats });
  }
  console.log(JSON.stringify({ asOf, summary }));
  return { asOf, summary };
}

async function persist(orgId, data, a) {
  const uuid = (slug) => data.subscriptionUuidBySlug[slug];
  const existing = Object.fromEntries((await (await getPool()).query(
    "SELECT id, payload, narrative, narrative_source, narrative_model FROM recommendations WHERE org_id = $1 AND superseded_at IS NULL", [orgId])).rows.map((r) => [r.id, r]));

  // Draft narratives outside the transaction (network calls), only when the evidence changed.
  const narratives = {};
  for (const r of a.recommendations) {
    const prev = existing[r.id];
    if (prev && JSON.stringify(prev.payload.evidence) === JSON.stringify(r.evidence) && prev.narrative) {
      narratives[r.id] = { text: prev.narrative, source: prev.narrative_source, model: prev.narrative_model };
      continue;
    }
    const s = a.subById[r.subscriptionId];
    narratives[r.id] = await draftNarrative(factSheet(r, s), templateNarrative(r, s));
  }

  return tx(async (db) => {
    let alerts = 0, recs = 0;
    await db.query("UPDATE renewal_alerts SET resolved_at = now() WHERE org_id = $1 AND resolved_at IS NULL", [orgId]);
    for (const al of a.renewalAlerts) {
      await db.query(
        `INSERT INTO renewal_alerts (org_id, subscription_id, kind, severity, message, due_date)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (subscription_id, kind, message) DO UPDATE SET severity = EXCLUDED.severity, last_seen_at = now(), resolved_at = NULL`,
        [orgId, uuid(al.subscriptionId), al.kind, al.severity, al.message, al.due]);
      alerts++;
    }
    const current = new Set();
    for (const r of a.recommendations) {
      const s = a.subById[r.subscriptionId];
      const n = narratives[r.id];
      current.add(r.id);
      await db.query(
        `INSERT INTO recommendations (id, org_id, subscription_id, type, basis, usage_import_id, confidence, payload, estimate_low, estimate_high, narrative, narrative_source, narrative_model, computed_at, superseded_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, now(), NULL)
         ON CONFLICT (org_id, id) DO UPDATE SET payload = EXCLUDED.payload, confidence = EXCLUDED.confidence, usage_import_id = EXCLUDED.usage_import_id,
           estimate_low = EXCLUDED.estimate_low, estimate_high = EXCLUDED.estimate_high, narrative = EXCLUDED.narrative,
           narrative_source = EXCLUDED.narrative_source, narrative_model = EXCLUDED.narrative_model, computed_at = now(), superseded_at = NULL`,
        [r.id, orgId, uuid(r.subscriptionId), r.type, r.basis === "data_gap" ? "data_gap" : r.basis,
          r.basis === "usage_import" ? s.usage.importId : null, r.confidence.level, JSON.stringify(r),
          r.estimate ? r.estimate.low : null, r.estimate ? r.estimate.high : null, n.text, n.source, n.model || null]);
      recs++;
    }
    for (const id of Object.keys(existing)) {
      if (!current.has(id)) await db.query("UPDATE recommendations SET superseded_at = now() WHERE org_id = $1 AND id = $2", [orgId, id]);
    }
    return { alerts, recommendations: recs, anomalies: a.anomalies.length };
  });
}

/** Compact, explicit facts for the narrative model. Usage facts are included only if imported. */
export function factSheet(r, s) {
  const usd = (n) => "$" + Math.round(n).toLocaleString("en-US");
  return {
    recommendation: { type: r.type, title: r.title, summary: r.summary, confidence: r.confidence.level, decideBy: r.dueDate },
    subscription: { name: s.name, owner: s.owner, seats: s.seats, assigned: s.assignedCount, unassigned: s.unassignedSeats, annualCost: usd(s.annualCost), renewal: s.renewal, noticeDeadline: s.noticeDeadline, autoRenew: s.autoRenew },
    departedEmployeesStillAssigned: s.terminatedAssignedIds.length,
    usage: s.usage.status === "imported"
      ? { status: "imported", report: s.usage.filename, windowStart: s.usage.windowStart, windowEnd: s.usage.periodEnd, activeAssignedUsers: s.usage.activeIds.length, inactiveAssignedUsers: s.usage.inactiveIds.length }
      : { status: "not_imported" },
    proposal: r.proposal || null,
    estimate: r.estimate ? { low: usd(r.estimate.low), high: usd(r.estimate.high), status: "estimated, unverified" } : null,
    dataGaps: r.dataGaps,
    nextSteps: r.nextSteps,
  };
}

export function templateNarrative(r, s) {
  return `${r.summary} ${r.estimate ? `Estimated annual value: $${Math.round(r.estimate.low).toLocaleString("en-US")}–$${Math.round(r.estimate.high).toLocaleString("en-US")} (unverified).` : ""} ${r.guardrail}`.trim();
}
