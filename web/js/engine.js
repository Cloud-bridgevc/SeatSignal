/*
 * SeatSignal analysis engine.
 *
 * Deterministic, evidence-first analysis shared by the browser demo and the
 * AWS Lambda functions. The engine computes every number; the language model
 * (Amazon Bedrock) only extracts contract fields and writes narrative around
 * facts this engine has already established.
 *
 * Guardrails enforced here:
 *  - Usage is only described when a usage report has been imported for that
 *    subscription. Without one, utilization is "unknown", never assumed.
 *  - Recommendations are proposals for human review. The engine has no code
 *    path that changes accounts or subscriptions.
 *  - Savings are "estimated" until a person records verification evidence.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.SeatSignalEngine = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const CONFIG = {
    activeWindowDays: 60, // activity within this many days of the report's period end counts as "active"
    minPeriodDaysForConfidence: 60, // shorter exports lower confidence
    staleAfterDays: 45, // report period ending longer ago than this is stale
    rightsizeThreshold: 0.6, // observed active / purchased seats below this triggers a right-size review
    bufferTarget: 0.15, // seats kept above observed active users (upper estimate)
    bufferConservative: 0.4, // seats kept above observed active users (lower estimate)
    renewalHorizonDays: 90,
    minUnassignedSeats: 3,
    unitPriceChangePct: 10,
    seatGrowthOverHeadcountPts: 10,
    usageDataRequestMinAnnual: 5000,
  };

  // ---------- date helpers (UTC, ISO yyyy-mm-dd) ----------
  const toDate = (iso) => new Date(iso + "T00:00:00Z");
  const daysBetween = (a, b) => Math.round((toDate(b) - toDate(a)) / 86400000);
  const addDays = (iso, d) => {
    const t = toDate(iso);
    t.setUTCDate(t.getUTCDate() + d);
    return t.toISOString().slice(0, 10);
  };
  const money = (n) => "$" + Math.round(n).toLocaleString("en-US");

  // ---------- CSV import ----------
  const REQUIRED_COLUMNS = ["email", "last_active_date"];

  function parseUsageCsv(text) {
    const lines = String(text).replace(/\r/g, "").split("\n").filter((l) => l.trim() !== "");
    if (lines.length === 0) return { rows: [], errors: ["File is empty."] };
    const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
    const missing = REQUIRED_COLUMNS.filter((c) => !header.includes(c));
    if (missing.length) return { rows: [], errors: [`Missing required column(s): ${missing.join(", ")}`] };
    const idx = (c) => header.indexOf(c);
    const rows = [];
    const errors = [];
    lines.slice(1).forEach((line, i) => {
      const cells = line.split(",").map((c) => c.trim());
      const email = (cells[idx("email")] || "").toLowerCase();
      const last = cells[idx("last_active_date")] || "";
      if (!email.includes("@")) { errors.push(`Row ${i + 2}: invalid email`); return; }
      if (last && !/^\d{4}-\d{2}-\d{2}$/.test(last)) { errors.push(`Row ${i + 2}: last_active_date must be YYYY-MM-DD`); return; }
      const days = idx("active_days_in_period") >= 0 ? Number(cells[idx("active_days_in_period")] || 0) : null;
      rows.push({ email, last_active_date: last, active_days_in_period: Number.isFinite(days) ? days : null });
    });
    return { rows, errors };
  }

  // ---------- core analysis ----------
  function analyze(data, opts) {
    const cfg = Object.assign({}, CONFIG, (opts && opts.config) || {});
    const asOf = (opts && opts.asOf) || data.meta.asOf;
    const empById = Object.fromEntries(data.employees.map((e) => [e.id, e]));
    const empByEmail = Object.fromEntries(data.employees.map((e) => [e.email.toLowerCase(), e]));

    const latestImport = {};
    for (const imp of data.imports) {
      const cur = latestImport[imp.subscriptionId];
      if (!cur || imp.periodEnd > cur.periodEnd) latestImport[imp.subscriptionId] = imp;
    }

    const subs = data.subscriptions.map((s) => {
      const assigned = data.assignments[s.id] || [];
      const terminatedAssigned = assigned.filter((id) => empById[id] && empById[id].status === "terminated");
      const contract = data.contracts[s.id] || null;
      const noticeDeadline = s.noticeDays != null ? addDays(s.renewal, -s.noticeDays) : null;
      const perSeatAnnual = s.perSeatMonthly != null ? s.perSeatMonthly * 12 : null;
      return {
        ...s,
        perSeatAnnual,
        assignedIds: assigned,
        assignedCount: assigned.length,
        terminatedAssignedIds: terminatedAssigned,
        unassignedSeats: s.seats != null ? Math.max(0, s.seats - assigned.length) : null,
        contract,
        noticeDeadline,
        daysToRenewal: daysBetween(asOf, s.renewal),
        daysToNotice: noticeDeadline ? daysBetween(asOf, noticeDeadline) : null,
        usage: analyzeUsage(s, assigned, latestImport[s.id], empById, empByEmail, asOf, cfg),
      };
    });
    const subById = Object.fromEntries(subs.map((s) => [s.id, s]));

    const anomalies = detectAnomalies(data, subById, cfg);
    const renewalAlerts = buildRenewalAlerts(subs, asOf, cfg);
    const recommendations = buildRecommendations(subs, data, empById, cfg, asOf);

    const seatBased = subs.filter((s) => s.seats != null);
    const seatSpend = seatBased.reduce((a, s) => a + s.annualCost, 0);
    const coveredSpend = seatBased.filter((s) => s.usage.status === "imported").reduce((a, s) => a + s.annualCost, 0);
    const renewing90 = subs.filter((s) => s.daysToRenewal >= 0 && s.daysToRenewal <= cfg.renewalHorizonDays);

    return {
      asOf,
      config: cfg,
      isSampleData: !!data.meta.isSampleData,
      subscriptions: subs,
      subById,
      recommendations,
      renewalAlerts,
      anomalies,
      totals: {
        annualSpend: subs.reduce((a, s) => a + s.annualCost, 0),
        subscriptionCount: subs.length,
        seatsPurchased: seatBased.reduce((a, s) => a + s.seats, 0),
        seatsAssigned: seatBased.reduce((a, s) => a + s.assignedCount, 0),
        usageCoverageSpendPct: seatSpend ? Math.round((coveredSpend / seatSpend) * 100) : 0,
        subsWithUsage: seatBased.filter((s) => s.usage.status === "imported").length,
        seatBasedCount: seatBased.length,
        renewing90Count: renewing90.length,
        renewing90Spend: renewing90.reduce((a, s) => a + s.annualCost, 0),
      },
    };
  }

  function analyzeUsage(sub, assigned, imp, empById, empByEmail, asOf, cfg) {
    if (!imp) {
      return {
        status: "not_imported",
        statement: "No usage report has been imported for this subscription. Utilization is unknown.",
      };
    }
    const periodDays = daysBetween(imp.periodStart, imp.periodEnd) + 1;
    const windowDays = Math.min(cfg.activeWindowDays, periodDays);
    const windowStart = addDays(imp.periodEnd, -(windowDays - 1));
    const assignedSet = new Set(assigned);
    const rowByEmpId = {};
    const unmatched = [];
    for (const r of imp.rows) {
      const e = empByEmail[r.email.toLowerCase()];
      if (e) rowByEmpId[e.id] = r;
      else unmatched.push(r.email);
    }
    const isActive = (r) => !!r && r.last_active_date !== "" && r.last_active_date >= windowStart && r.last_active_date <= imp.periodEnd;
    const activeIds = [], inactiveIds = [], neverActiveIds = [], notInExportIds = [];
    for (const id of assigned) {
      const r = rowByEmpId[id];
      if (!r) notInExportIds.push(id);
      // Departed employees (per HRIS) never count toward seats still needed, even if active earlier in the window.
      else if (isActive(r) && empById[id].status !== "terminated") activeIds.push(id);
      else {
        inactiveIds.push(id);
        if (!r.last_active_date) neverActiveIds.push(id);
      }
    }
    // Licensed users in the export who are not in the SSO assignment list.
    const activeUnassigned = Object.entries(rowByEmpId).filter(([id, r]) => !assignedSet.has(id) && isActive(r)).length;
    const freshnessDays = daysBetween(imp.periodEnd, asOf);

    const issues = [];
    if (periodDays < cfg.minPeriodDaysForConfidence) issues.push(`Report covers only ${periodDays} days (minimum ${cfg.minPeriodDaysForConfidence} for a confident read).`);
    if (freshnessDays > cfg.staleAfterDays) issues.push(`Report period ended ${freshnessDays} days ago.`);
    if (unmatched.length) issues.push(`${unmatched.length} row(s) in the report could not be matched to the HRIS roster.`);
    if (notInExportIds.length) issues.push(`${notInExportIds.length} assigned user(s) do not appear in the report.`);

    return {
      status: "imported",
      importId: imp.id,
      source: imp.source,
      filename: imp.filename,
      importedAt: imp.importedAt,
      importedBy: imp.importedBy,
      periodStart: imp.periodStart,
      periodEnd: imp.periodEnd,
      periodDays,
      windowDays,
      windowStart,
      rowCount: imp.rows.length,
      unmatchedEmails: unmatched,
      activeIds,
      inactiveIds,
      neverActiveIds,
      notInExportIds,
      activeUnassigned,
      observedActive: activeIds.length + activeUnassigned,
      utilizationOfSeats: sub.seats ? (activeIds.length + activeUnassigned) / sub.seats : null,
      freshnessDays,
      issues,
      statement: `${activeIds.length} of ${assigned.length} assigned users show activity between ${windowStart} and ${imp.periodEnd} in the imported report "${imp.filename}".`,
    };
  }

  function confidenceFor(sub) {
    const u = sub.usage;
    const reasons = [];
    let score = 3;
    if (u.periodDays < CONFIG.minPeriodDaysForConfidence) { score -= 2; reasons.push(`usage report covers ${u.periodDays} days`); }
    if (u.freshnessDays > CONFIG.staleAfterDays) { score -= 1; reasons.push("usage report is stale"); }
    if (u.unmatchedEmails.length / Math.max(1, u.rowCount) > 0.05) { score -= 1; reasons.push("many report rows unmatched to HRIS"); }
    if (u.notInExportIds.length) { score -= 1; reasons.push("some assigned users missing from report"); }
    const seatField = sub.contract && sub.contract.fields.seats;
    if (!seatField || seatField.confidence !== "high") { score -= 1; reasons.push("seat count not confirmed from contract"); }
    const level = score >= 3 ? "High" : score === 2 ? "Medium" : "Low";
    return { level, reasons: reasons.length ? reasons : ["usage report covers a full quarter, is recent, and matches the HRIS roster; seat count confirmed from contract"] };
  }

  function buildRecommendations(subs, data, empById, cfg, asOf) {
    const recs = [];
    const guardrail = "SeatSignal does not change user accounts or subscriptions. Any change is made by the system owner after approval.";
    const deadlineText = (s) => s.noticeDeadline
      ? `Notice deadline ${s.noticeDeadline} (${s.daysToNotice >= 0 ? s.daysToNotice + " days away" : Math.abs(s.daysToNotice) + " days ago"})`
      : "Notice period not found in contract";

    const rightsized = new Set();

    for (const s of subs) {
      const u = s.usage;
      // 1. Right-size review — requires imported usage.
      if (u.status === "imported" && s.seats && u.utilizationOfSeats < cfg.rightsizeThreshold) {
        const A = u.observedActive;
        const targetSeats = Math.min(s.seats, Math.max(A + 1, Math.ceil(A * (1 + cfg.bufferTarget))));
        const conservativeSeats = Math.min(s.seats, Math.max(A + 2, Math.ceil(A * (1 + cfg.bufferConservative))));
        const conf = confidenceFor(s);
        const overlapping = subs.filter((o) => o.id !== s.id && o.category === s.category);
        const evidence = [];
        const cf = s.contract && s.contract.fields;
        if (cf) {
          evidence.push({ type: "contract", source: s.contract.document, detail: `${s.seats} licenses at $${s.perSeatMonthly}/user/month (${money(s.annualCost)}/yr). Renewal ${s.renewal}; ${s.autoRenew ? "auto-renews" : "does not auto-renew"}; ${s.noticeDays ?? "no"}-day notice.`, ref: `p.${cf.seats.page}: "${cf.seats.snippet}"` });
          if (s.contract.excerpt) {
            const clause = s.contract.excerpt.find((l) => /reduce the number of licenses/i.test(l));
            if (clause) evidence.push({ type: "contract", source: s.contract.document, detail: "Contract allows reducing licenses at renewal with notice.", ref: clause });
          }
        }
        evidence.push({ type: "license_mapping", source: data.meta.sources.idp.file, detail: `${s.assignedCount} of ${s.seats} licenses are assigned to people; ${s.unassignedSeats} are unassigned.` });
        evidence.push({ type: "usage_import", source: u.filename, detail: `${u.activeIds.length} assigned users active between ${u.windowStart} and ${u.periodEnd}. ${u.inactiveIds.length} assigned users show no activity in that window (${u.neverActiveIds.length} have no recorded activity at all).`, ref: `${u.source}; imported ${u.importedAt.slice(0, 10)} by ${u.importedBy}` });
        if (s.terminatedAssignedIds.length) {
          evidence.push({ type: "hris", source: data.meta.sources.hris.file, detail: `${s.terminatedAssignedIds.length} assigned users are recorded as departed in the HRIS roster (included in the inactive count above).` });
        }
        for (const o of overlapping) {
          const both = s.assignedIds.filter((id) => o.assignedIds.includes(id)).length;
          evidence.push({ type: "license_mapping", source: data.meta.sources.idp.file, detail: `${both} of the ${s.assignedCount} ${s.name} users also hold a ${o.name} license (same category: ${s.category}). ${o.usage.status === "imported" ? "" : `${o.name} usage has not been imported.`}`.trim() });
        }
        const dataGaps = [...u.issues];
        dataGaps.push(`"Activity" follows the vendor's own definition in the export (${u.source}). It may not capture read-only or API usage.`);
        for (const o of overlapping) if (o.usage.status !== "imported") dataGaps.push(`${o.name} usage is not imported, so SeatSignal cannot say whether ${o.name} could absorb ${s.name} work.`);
        if (cf && cf.priceIncreaseCap && cf.priceIncreaseCap.value) dataGaps.push(`Estimate uses current pricing; contract allows up to ${cf.priceIncreaseCap.value} increase at renewal.`);

        recs.push({
          id: `rightsize:${s.id}`,
          type: "rightsize",
          subscriptionId: s.id,
          title: `Review ${s.name} seat count before renewal`,
          summary: `Imported usage shows ${A} active users against ${s.seats} purchased licenses (${Math.round(u.utilizationOfSeats * 100)}%). Investigate reducing to roughly ${targetSeats}–${conservativeSeats} seats at renewal. ${deadlineText(s)}.`,
          basis: "usage_import",
          confidence: conf,
          evidence,
          dataGaps,
          proposal: { currentSeats: s.seats, proposedSeatsRange: [targetSeats, conservativeSeats] },
          estimate: { low: (s.seats - conservativeSeats) * s.perSeatAnnual, high: (s.seats - targetSeats) * s.perSeatAnnual, method: `(current seats − proposed seats) × $${s.perSeatAnnual}/seat/yr at current list price; range keeps a ${Math.round(cfg.bufferTarget * 100)}–${Math.round(cfg.bufferConservative * 100)}% buffer above observed active users.` },
          nextSteps: [
            `Confirm with the ${s.owner} owner which teams rely on ${s.name}.`,
            `Ask the ${u.inactiveIds.length} inactive users whether they still need access.`,
            s.noticeDeadline ? `Decide before ${s.noticeDeadline}; the owner sends any seat-reduction notice to the vendor.` : "Confirm the notice period with the vendor.",
          ],
          dueDate: s.noticeDeadline || s.renewal,
          guardrail,
          featured: !!s.featured,
        });
        rightsized.add(s.id);
      }
    }

    for (const s of subs) {
      // 2. Licenses assigned to departed employees (HRIS + IdP; not a usage claim).
      if (s.terminatedAssignedIds.length && s.seats) {
        const n = s.terminatedAssignedIds.length;
        const included = rightsized.has(s.id);
        recs.push({
          id: `departed:${s.id}`,
          type: "departed",
          subscriptionId: s.id,
          title: `${n} ${s.name} license${n > 1 ? "s" : ""} still assigned to departed employees`,
          summary: `The HRIS roster lists ${n} assigned user${n > 1 ? "s" : ""} as departed. IT should confirm and complete offboarding through its normal process.`,
          basis: "hris",
          confidence: { level: "High", reasons: ["employment status comes from the HRIS export; assignment from the identity-provider export"] },
          evidence: [
            { type: "hris", source: data.meta.sources.hris.file, detail: s.terminatedAssignedIds.map((id) => `${empById[id].name} (departed ${empById[id].terminatedOn})`).join("; ") },
            { type: "license_mapping", source: data.meta.sources.idp.file, detail: `Still assigned to ${s.name}.` },
          ],
          dataGaps: ["A reclaimed license only saves money if the seat count is reduced at renewal or reassigned to avoid a new purchase."],
          estimate: included ? null : { low: 0, high: n * s.perSeatAnnual, method: `Up to ${n} × $${s.perSeatAnnual}/seat/yr if seats are reduced at renewal.` },
          estimateNote: included ? `Included in the ${s.name} seat-count review.` : null,
          nextSteps: ["IT confirms departure status and completes offboarding.", "Reassign the freed licenses or reduce seats at renewal."],
          dueDate: s.noticeDeadline || s.renewal,
          guardrail,
        });
      }

      // 3. Unassigned seats (license mapping; not a usage claim).
      if (!rightsized.has(s.id) && s.seats && s.unassignedSeats >= cfg.minUnassignedSeats) {
        recs.push({
          id: `unassigned:${s.id}`,
          type: "unassigned",
          subscriptionId: s.id,
          title: `${s.unassignedSeats} ${s.name} licenses are not assigned to anyone`,
          summary: `${s.assignedCount} of ${s.seats} purchased licenses are assigned in the identity provider. Check whether the remainder are reserved for planned hires.`,
          basis: "license_mapping",
          confidence: { level: s.contract ? "High" : "Medium", reasons: [s.contract ? "seat count from contract; assignments from identity-provider export" : "no contract on file to confirm the purchased seat count"] },
          evidence: [
            { type: s.contract ? "contract" : "invoice", source: s.contract ? s.contract.document : data.meta.sources.ap.file, detail: `${s.seats} licenses purchased.` },
            { type: "license_mapping", source: data.meta.sources.idp.file, detail: `${s.assignedCount} licenses assigned.` },
          ],
          dataGaps: s.usage.status === "imported" ? [] : ["Usage is not imported, so this says nothing about whether assigned licenses are used."],
          estimate: { low: 0, high: s.unassignedSeats * s.perSeatAnnual, method: `Up to ${s.unassignedSeats} × $${s.perSeatAnnual}/seat/yr if not needed for planned hires.` },
          nextSteps: [`Ask the ${s.owner} owner about hiring plans for these seats.`, "Reduce the seat count at renewal if they are not needed."],
          dueDate: s.noticeDeadline || s.renewal,
          guardrail,
        });
      }

      // 4. Usage unknown → request data before deciding (never infer).
      if (s.usage.status !== "imported" && s.seats && s.annualCost >= cfg.usageDataRequestMinAnnual) {
        recs.push({
          id: `usage-gap:${s.id}`,
          type: "usage_gap",
          subscriptionId: s.id,
          title: `Import ${s.name} usage before the renewal decision`,
          summary: `No usage report has been imported, so SeatSignal cannot assess whether ${s.name}'s ${s.seats} licenses are used. Request an admin activity export from the system owner.`,
          basis: "data_gap",
          confidence: { level: "n/a", reasons: ["this is a data request, not a finding"] },
          evidence: [{ type: "contract", source: s.contract ? s.contract.document : "No contract on file", detail: `${money(s.annualCost)}/yr; renews ${s.renewal}.` }],
          dataGaps: ["Utilization unknown."],
          estimate: null,
          estimateNote: "Not estimated — no usage evidence.",
          nextSteps: [`Ask the ${s.owner} owner for a user-activity export covering at least the last 90 days.`, "Import it on the Usage Imports page."],
          dueDate: s.noticeDeadline || s.renewal,
          guardrail,
        });
      }
    }

    // 5. Functional overlap by category.
    const byCat = {};
    for (const s of subs) (byCat[s.category] = byCat[s.category] || []).push(s);
    for (const [cat, list] of Object.entries(byCat)) {
      if (list.length < 2) continue;
      const [a, b] = list.slice().sort((x, y) => y.annualCost - x.annualCost);
      const both = b.assignedIds.filter((id) => a.assignedIds.includes(id)).length;
      const missing = list.filter((s) => s.usage.status !== "imported").map((s) => s.name);
      recs.push({
        id: `overlap:${list.map((s) => s.id).sort().join("+")}`,
        type: "overlap",
        subscriptionId: b.id,
        relatedSubscriptionIds: list.map((s) => s.id),
        title: `Investigate overlap: ${list.map((s) => s.name).join(" and ")} (${cat})`,
        summary: `${list.length} subscriptions serve ${cat.toLowerCase()}. ${both} of ${b.assignedCount} ${b.name} users also hold ${a.name}. Consolidation should be investigated with both owners.`,
        basis: "license_mapping",
        confidence: { level: missing.length ? "Low" : "Medium", reasons: missing.length ? [`usage not imported for ${missing.join(", ")}`] : ["usage imported for all overlapping tools; feature fit still needs owner review"] },
        evidence: list.map((s) => ({ type: "license_mapping", source: data.meta.sources.idp.file, detail: `${s.name}: ${s.assignedCount} assigned, ${money(s.annualCost)}/yr, renews ${s.renewal}. Usage: ${s.usage.status === "imported" ? s.usage.statement : "not imported"}` })),
        dataGaps: [...missing.map((m) => `${m} usage not imported.`), "Feature requirements and integrations are not known to SeatSignal."],
        estimate: null,
        estimateNote: "Not estimated — consolidation savings depend on owner review and vendor negotiation.",
        nextSteps: ["Owners compare required features and integrations.", `Align renewal timing (${list.map((s) => `${s.name} ${s.renewal}`).join(", ")}).`],
        dueDate: list.map((s) => s.noticeDeadline || s.renewal).sort()[0],
        guardrail,
      });
    }

    const typeOrder = { rightsize: 0, departed: 1, unassigned: 2, overlap: 3, usage_gap: 4 };
    recs.sort((x, y) => (y.featured ? 1 : 0) - (x.featured ? 1 : 0) || String(x.dueDate).localeCompare(String(y.dueDate)) || typeOrder[x.type] - typeOrder[y.type]);
    return recs;
  }

  function buildRenewalAlerts(subs, asOf, cfg) {
    const alerts = [];
    for (const s of subs) {
      const soon = s.daysToRenewal >= 0 && s.daysToRenewal <= cfg.renewalHorizonDays;
      if (soon && s.noticeDeadline && s.daysToNotice < 0 && s.autoRenew) {
        alerts.push({ subscriptionId: s.id, severity: "critical", kind: "notice_passed", message: `Notice deadline ${s.noticeDeadline} has passed; contract auto-renews on ${s.renewal}. Confirm terms with the vendor.`, due: s.renewal });
      } else if (soon && s.noticeDeadline) {
        alerts.push({ subscriptionId: s.id, severity: s.daysToNotice <= 14 ? "critical" : "warning", kind: "renewal_window", message: `Renews ${s.renewal} (${s.daysToRenewal} days). Notice deadline ${s.noticeDeadline} (${s.daysToNotice} days).`, due: s.noticeDeadline });
      } else if (soon) {
        alerts.push({ subscriptionId: s.id, severity: "warning", kind: "renewal_window", message: `Renews ${s.renewal} (${s.daysToRenewal} days).`, due: s.renewal });
      }
      if (!s.contract) {
        alerts.push({ subscriptionId: s.id, severity: soon ? "critical" : "warning", kind: "missing_contract", message: "No contract document on file. Renewal terms cannot be verified.", due: s.renewal });
      } else {
        for (const [name, f] of Object.entries(s.contract.fields)) {
          if (f.confidence === "none") alerts.push({ subscriptionId: s.id, severity: soon ? "warning" : "info", kind: "missing_field", message: `Contract field not found: ${humanField(name)}.`, due: s.renewal });
        }
      }
    }
    const sev = { critical: 0, warning: 1, info: 2 };
    return alerts.sort((a, b) => sev[a.severity] - sev[b.severity] || a.due.localeCompare(b.due));
  }

  function humanField(name) {
    return { noticeDays: "notice period", priceIncreaseCap: "price-increase cap", autoRenew: "auto-renewal", seats: "seat count" }[name] || name;
  }

  function detectAnomalies(data, subById, cfg) {
    const out = [];
    const q = data.quarters;
    for (const s of Object.values(subById)) {
      const inv = q.map((qq) => data.invoices.find((i) => i.subscriptionId === s.id && i.quarter === qq)).filter(Boolean);
      for (let i = 1; i < inv.length; i++) {
        const prev = inv[i - 1], cur = inv[i];
        const costPct = ((cur.amount - prev.amount) / prev.amount) * 100;
        if (prev.seats && cur.seats) {
          const seatPct = ((cur.seats - prev.seats) / prev.seats) * 100;
          const unitPrev = prev.amount / prev.seats, unitCur = cur.amount / cur.seats;
          const unitPct = ((unitCur - unitPrev) / unitPrev) * 100;
          const hcPrev = data.headcountByQuarter[prev.quarter], hcCur = data.headcountByQuarter[cur.quarter];
          const hcPct = ((hcCur - hcPrev) / hcPrev) * 100;
          if (Math.abs(unitPct) >= cfg.unitPriceChangePct) {
            out.push({ subscriptionId: s.id, quarter: cur.quarter, kind: "unit_price", severity: "warning", title: `${s.name}: price per seat ${unitPct > 0 ? "rose" : "fell"} ${Math.abs(unitPct).toFixed(0)}%`, detail: `Seats unchanged at ${cur.seats}; quarterly invoice went from ${money(prev.amount)} to ${money(cur.amount)}.`, evidence: [prev.invoiceRef, cur.invoiceRef], costPct, seatPct, hcPct });
          }
          if (seatPct >= 15 && seatPct - hcPct >= cfg.seatGrowthOverHeadcountPts) {
            out.push({ subscriptionId: s.id, quarter: cur.quarter, kind: "seat_growth", severity: "warning", title: `${s.name}: seats grew ${seatPct.toFixed(0)}% while headcount changed ${hcPct >= 0 ? "+" : ""}${hcPct.toFixed(1)}%`, detail: `Seats ${prev.seats} → ${cur.seats}; headcount ${hcPrev} → ${hcCur}. Quarterly cost ${money(prev.amount)} → ${money(cur.amount)}.`, evidence: [prev.invoiceRef, cur.invoiceRef, "HRIS headcount"], costPct, seatPct, hcPct });
          }
        }
      }
    }
    return out.sort((a, b) => b.quarter.localeCompare(a.quarter));
  }

  // ---------- savings ledger ----------
  // workflow: { [recId]: { status, verifiedAmount, verificationRef, history: [...] } }
  const STATUSES = ["open", "in_review", "approved", "rejected", "actioned", "verified"];

  function summarizeSavings(recs, workflow) {
    const sum = { estimatedOpen: [0, 0], approvedPending: [0, 0], verified: 0, rejected: 0, notEstimated: 0 };
    for (const r of recs) {
      const st = (workflow[r.id] && workflow[r.id].status) || "open";
      if (st === "verified") { sum.verified += Number(workflow[r.id].verifiedAmount) || 0; continue; }
      if (st === "rejected") { sum.rejected++; continue; }
      if (!r.estimate) { sum.notEstimated++; continue; }
      const bucket = st === "approved" || st === "actioned" ? sum.approvedPending : sum.estimatedOpen;
      bucket[0] += r.estimate.low;
      bucket[1] += r.estimate.high;
    }
    return sum;
  }

  // ---------- public-site audit estimator ----------
  // Purely illustrative: every input is supplied by the visitor, and the output is labelled as an estimate.
  function estimateAudit(i) {
    const spend = i.employees * i.spendPerEmployee;
    const seatBased = spend * (i.seatBasedPct / 100);
    const low = seatBased * (i.idleLowPct / 100);
    const high = seatBased * (i.idleHighPct / 100);
    const renewals90 = Math.round(i.apps * (90 / 365));
    const evidenceReady = i.usageDataPct >= 60 ? "strong" : i.usageDataPct >= 30 ? "partial" : "limited";
    return { spend, seatBased, low, high, renewals90, evidenceReady };
  }

  return { CONFIG, STATUSES, analyze, parseUsageCsv, summarizeSavings, estimateAudit, daysBetween, addDays, money };
});
