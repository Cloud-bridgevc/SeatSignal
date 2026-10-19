/* SeatSignal workspace (static demo). All data is fictional sample data. */
(function () {
  "use strict";
  const E = window.SeatSignalEngine;
  const BASE = window.SEATSIGNAL_SAMPLE;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  // ---------- formatting ----------
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const usd = (n) => "$" + Math.round(n).toLocaleString("en-US");
  const k = (n) => (Math.abs(n) >= 1000 ? "$" + (n / 1000).toFixed(Math.abs(n) >= 100000 ? 0 : 1) + "k" : "$" + Math.round(n));
  const rng = (lo, hi) => (Math.round(lo) === Math.round(hi) ? k(hi) : `${k(lo)} – ${k(hi)}`);
  const date = (iso) => (iso ? new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "—");
  const pct = (x) => Math.round(x * 100) + "%";
  const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;

  const ICON = {
    alert: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.8l6.6 11.6H1.4z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M8 6.2v3.3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="8" cy="11.4" r=".85" fill="currentColor"/></svg>',
    clock: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 4.6V8l2.3 1.6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    info: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 7.2v4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="8" cy="4.9" r=".85" fill="currentColor"/></svg>',
    shield: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5l5.5 2v4.2c0 3.3-2.3 5.6-5.5 6.8-3.2-1.2-5.5-3.5-5.5-6.8V3.5z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M5.6 8l1.7 1.7 3.2-3.3" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    spark: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5l1.5 4.4 4.5 1.6-4.5 1.6L8 13.5l-1.5-4.4L2 7.5l4.5-1.6z" fill="currentColor"/></svg>',
    check: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.4l3 3 6-6.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  };
  const SEV_ICON = { critical: ICON.alert, warning: ICON.clock, info: ICON.info };
  const sevLabel = (s) => `<span class="sev sev-${s}">${SEV_ICON[s]}${s[0].toUpperCase() + s.slice(1)}</span>`;

  // ---------- persistence (per-viewer convenience; demo only) ----------
  const WF_KEY = "seatsignal.demo.workflow.v1";
  const IMP_KEY = "seatsignal.demo.imports.v1";
  const store = {
    get(key, dflt) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : dflt; } catch (e) { return dflt; } },
    set(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* storage unavailable: state lives for this page view only */ } },
    del(key) { try { localStorage.removeItem(key); } catch (e) { /* ignore */ } },
  };
  const SEED_WORKFLOW = () => ({
    "unassigned:helph": { status: "in_review", history: [{ at: "2026-10-14T10:05:00Z", by: "R. Mensah (Customer Success, sample)", action: "Started review", note: "Checking Q1 hiring plan for support agents." }] },
    "departed:codev": {
      status: "verified", verifiedAmount: 504, verificationRef: "CodeVault true-down order CV-2026-118 (sample)",
      history: [
        { at: "2026-10-03T09:00:00Z", by: "A. Patel (IT, sample)", action: "Started review" },
        { at: "2026-10-04T14:20:00Z", by: "D. Haddad (Finance, sample)", action: "Approved for owner action", note: "Remove departed users; request true-down." },
        { at: "2026-10-10T11:00:00Z", by: "A. Patel (IT, sample)", action: "Owner reported action completed", note: "Offboarded in IdP; vendor confirmed true-down of 2 seats." },
        { at: "2026-10-16T16:45:00Z", by: "D. Haddad (Finance, sample)", action: "Savings verified", note: "Credit memo matched to CV-2026-118: $504/yr." },
      ],
    },
  });
  let workflow = store.get(WF_KEY, null) || SEED_WORKFLOW();
  let userImports = store.get(IMP_KEY, []);
  const saveWorkflow = () => store.set(WF_KEY, workflow);

  const dataset = () => Object.assign({}, BASE, { imports: BASE.imports.concat(userImports) });
  let A = E.analyze(dataset());
  const empById = Object.fromEntries(BASE.employees.map((e) => [e.id, e]));
  const wfOf = (id) => workflow[id] || { status: "open", history: [] };

  const STATUS_LABEL = { open: "Open", in_review: "In review", approved: "Approved", rejected: "Rejected", actioned: "Owner actioned", verified: "Verified" };
  const statusChip = (id) => { const s = wfOf(id).status; return `<span class="st st-${s}">${s === "verified" ? ICON.check : ""}${STATUS_LABEL[s]}</span>`; };
  const TYPE_LABEL = { rightsize: "Seat right-size", departed: "Departed employees", unassigned: "Unassigned seats", overlap: "Functional overlap", usage_gap: "Usage data needed" };
  const confBadge = (c) => c.level === "n/a" ? '<span class="badge">Data request</span>' : `<span class="badge ${c.level === "High" ? "badge-good" : c.level === "Medium" ? "badge-warn" : "badge-crit"}">Confidence: ${c.level}</span>`;
  const estText = (r) => r.estimate ? `<b>${rng(r.estimate.low, r.estimate.high)}</b>/yr <span class="muted">estimated</span>` : `<span class="muted">${esc(r.estimateNote || "Not estimated")}</span>`;

  // ---------- usage bar ----------
  function usageBar(s) {
    if (!s.seats) return '<span class="unknown-tag">Platform fee — no seats</span>';
    if (s.usage.status !== "imported") {
      return `<div class="ubar" data-tip="${esc(s.name)}: no usage report imported — utilization unknown. ${s.assignedCount} of ${s.seats} licenses assigned."><span class="u-unknown" style="width:100%"></span></div><div class="unknown-tag">Usage unknown — not imported</div>`;
    }
    const a = s.usage.activeIds.length, assigned = s.assignedCount, seats = Math.max(s.seats, assigned);
    const inact = assigned - a, un = Math.max(0, s.seats - assigned);
    const w = (n) => (n / seats) * 100 + "%";
    return `<div class="ubar" role="img" aria-label="${a} active, ${inact} assigned but inactive, ${un} unassigned of ${s.seats} seats" data-tip="${esc(s.name)} · ${a} active · ${inact} assigned, no activity in ${s.usage.windowDays}-day window · ${un} unassigned · source: ${esc(s.usage.filename)}">
      ${a ? `<span class="u-active" style="width:${w(a)}"></span>` : ""}${inact ? `<span class="u-inactive" style="width:${w(inact)}"></span>` : ""}${un ? `<span class="u-unassigned" style="width:${w(un)}"></span>` : ""}
    </div><div class="xs muted num">${a} active / ${s.seats} seats (${pct(a / s.seats)})</div>`;
  }
  const usageLegend = () => `<div class="legend"><span><i class="u-active"></i>Active in window (imported data)</span><span><i class="u-inactive"></i>Assigned, no activity</span><span><i class="u-unassigned"></i>Unassigned</span><span><i class="u-unknown"></i>Usage not imported</span></div>`;

  // ---------- navigation ----------
  const NAV = [
    ["Overview", [["overview", "Overview"]]],
    ["Inventory", [["subscriptions", "Subscriptions"], ["vendors", "Vendors & contracts"], ["licenses", "License mapping"], ["imports", "Usage imports"]]],
    ["Analysis", [["renewals", "Renewal calendar"], ["costs", "Cost analysis"], ["recommendations", "AI recommendations"]]],
    ["Decisions", [["savings", "Savings tracker"], ["approvals", "Review & approval"], ["report", "Executive report"]]],
  ];
  function renderNav(active) {
    const openRecs = A.recommendations.filter((r) => ["open", "in_review"].includes(wfOf(r.id).status)).length;
    const pending = A.recommendations.filter((r) => ["in_review", "approved", "actioned"].includes(wfOf(r.id).status)).length;
    $("#nav").innerHTML = NAV.map(([g, items]) => `<div class="nav-group">${g}</div>` + items.map(([id, label]) => {
      const count = id === "recommendations" ? openRecs : id === "approvals" ? pending : 0;
      return `<a href="#/${id}" ${active === id ? 'aria-current="page"' : ""}><span>${label}</span>${count ? `<span class="nav-count">${count}</span>` : ""}</a>`;
    }).join("")).join("");
  }

  function head(title, sub, actions, crumbs) {
    return `<div class="page-head"><div>${crumbs ? `<div class="crumbs">${crumbs}</div>` : ""}<h1>${title}</h1>${sub ? `<p>${sub}</p>` : ""}</div>${actions ? `<div class="wf-actions no-print">${actions}</div>` : ""}</div>`;
  }

  // ---------- views ----------
  const views = {};

  views.overview = function () {
    const t = A.totals;
    const sv = E.summarizeSavings(A.recommendations, workflow);
    const featured = A.recommendations.find((r) => r.featured);
    const alerts = A.renewalAlerts.filter((a) => a.severity !== "info").slice(0, 6);
    const seatSubs = A.subscriptions.filter((s) => s.seats).sort((a, b) => b.annualCost - a.annualCost);
    return head("Overview", `Data as of ${date(A.asOf)}. Usage figures come only from imported reports. Subscriptions without a report show "unknown".`) + `
      <div class="kpis">
        <div class="kpi"><div class="kpi-label">Annual subscription spend</div><div class="kpi-value">${usd(t.annualSpend)}</div><div class="kpi-sub">${t.subscriptionCount} subscriptions · from contracts &amp; AP</div></div>
        <div class="kpi"><div class="kpi-label">Renewing in 90 days</div><div class="kpi-value">${t.renewing90Count}</div><div class="kpi-sub">${usd(t.renewing90Spend)} annual value</div></div>
        <div class="kpi"><div class="kpi-label">Usage evidence coverage</div><div class="kpi-value">${t.usageCoverageSpendPct}%</div><div class="kpi-sub">of per-seat spend · ${t.subsWithUsage} of ${t.seatBasedCount} subscriptions imported</div></div>
        <div class="kpi est"><div class="kpi-label">Estimated opportunity <span class="badge">Estimate</span></div><div class="kpi-value">${rng(sv.estimatedOpen[0], sv.estimatedOpen[1])}</div><div class="kpi-sub">open recommendations, per year · not yet approved</div></div>
        <div class="kpi verified"><div class="kpi-label">Verified savings ${ICON.check.replace("<svg", '<svg width="13" height="13"')}</div><div class="kpi-value">${usd(sv.verified)}</div><div class="kpi-sub">confirmed by finance with evidence</div></div>
      </div>
      <div class="grid g-main">
        <div class="stack">
          ${featured ? `
          <section class="panel">
            <div class="panel-head"><h2>Guided walkthrough: how SeatSignal flagged ${esc(A.subById[featured.subscriptionId].name)}</h2><span class="badge badge-sample">SAMPLE DATA</span></div>
            <div class="panel-body">
              <p class="small" style="margin-bottom:12px">${esc(featured.summary)}</p>
              ${usageBar(A.subById[featured.subscriptionId])}
              <div style="margin-top:14px; display:flex; gap:10px; flex-wrap:wrap; align-items:center">
                <a class="btn btn-primary btn-sm" href="#/recommendations/${encodeURIComponent(featured.id)}">See the evidence trail →</a>
                ${confBadge(featured.confidence)} <span class="small">${estText(featured)}</span>
              </div>
            </div>
          </section>` : ""}
          <section class="panel">
            <div class="panel-head"><h2>Seat utilization by subscription</h2>${usageLegend()}</div>
            <div class="table-wrap"><table class="data">
              <thead><tr><th>Subscription</th><th style="width:45%">Seats</th><th class="r">Annual cost</th></tr></thead>
              <tbody>${seatSubs.map((s) => `<tr class="clickable" data-href="#/subscriptions/${s.id}"><td><b>${esc(s.name)}</b><div class="xs muted">${esc(s.category)}</div></td><td>${usageBar(s)}</td><td class="r num">${usd(s.annualCost)}</td></tr>`).join("")}</tbody>
            </table></div>
          </section>
        </div>
        <div class="stack">
          <section class="panel">
            <div class="panel-head"><h2>Needs attention</h2><a class="small" href="#/renewals">Renewal calendar →</a></div>
            <div class="panel-body" style="padding-top:4px;padding-bottom:4px">
              ${alerts.map((a) => `<div style="padding:10px 0;border-bottom:1px solid var(--line)"><div style="display:flex;justify-content:space-between;gap:8px">${sevLabel(a.severity)}<span class="xs muted">${date(a.due)}</span></div><div class="small" style="margin-top:4px"><a href="#/subscriptions/${a.subscriptionId}"><b>${esc(A.subById[a.subscriptionId].name)}</b></a> — ${esc(a.message)}</div></div>`).join("")}
            </div>
          </section>
          <section class="panel">
            <div class="panel-head"><h2>Spend anomalies</h2><a class="small" href="#/costs">Cost analysis →</a></div>
            <div class="panel-body" style="padding-top:4px;padding-bottom:4px">
              ${A.anomalies.map((x) => `<div style="padding:10px 0;border-bottom:1px solid var(--line)"><div class="small"><b>${esc(x.title)}</b></div><div class="xs muted">${esc(x.quarter)} · ${esc(x.detail)}</div></div>`).join("")}
            </div>
          </section>
          <div class="callout callout-guard">${ICON.shield}<div><strong>SeatSignal never acts on its own.</strong> It doesn't disable accounts, remove licenses or cancel subscriptions. Every proposed action goes to a person for review.</div></div>
        </div>
      </div>`;
  };

  views.subscriptions = function (id) {
    if (id) return subscriptionDetail(id);
    const rows = A.subscriptions.slice().sort((a, b) => a.renewal.localeCompare(b.renewal));
    return head("Subscription inventory", `${rows.length} subscriptions consolidated from contracts, AP invoices and identity-provider assignments.`) + `
      <section class="panel"><div class="table-wrap"><table class="data">
        <thead><tr><th>Subscription</th><th>Category</th><th>Owner</th><th class="r">Seats</th><th class="r">Assigned</th><th class="r">Annual cost</th><th>Renewal</th><th>Usage data</th><th>Contract</th></tr></thead>
        <tbody>${rows.map((s) => `<tr class="clickable" data-href="#/subscriptions/${s.id}">
          <td><b>${esc(s.name)}</b><div class="xs muted">${esc(s.vendor)}</div></td>
          <td>${esc(s.category)}</td><td>${esc(s.owner)}</td>
          <td class="r num">${s.seats ?? "—"}</td><td class="r num">${s.seats ? s.assignedCount : "—"}</td>
          <td class="r num">${usd(s.annualCost)}</td>
          <td class="num">${date(s.renewal)}<div class="xs muted">${s.daysToRenewal} days${s.autoRenew ? " · auto-renews" : ""}</div></td>
          <td>${!s.seats ? '<span class="badge">n/a</span>' : s.usage.status === "imported" ? `<span class="badge badge-good">Imported</span><div class="xs muted">${date(s.usage.periodEnd)}</div>` : '<span class="badge">Not imported</span>'}</td>
          <td>${s.contract ? '<span class="badge badge-info">On file</span>' : '<span class="badge badge-crit">Missing</span>'}</td>
        </tr>`).join("")}</tbody>
      </table></div></section>`;
  };

  function subscriptionDetail(id) {
    const s = A.subById[id];
    if (!s) return notFound();
    const recs = A.recommendations.filter((r) => r.subscriptionId === id || (r.relatedSubscriptionIds || []).includes(id));
    const alerts = A.renewalAlerts.filter((a) => a.subscriptionId === id);
    const inv = BASE.invoices.filter((i) => i.subscriptionId === id);
    const u = s.usage;
    return head(esc(s.name), `${esc(s.vendor)} · ${esc(s.category)} · owner: ${esc(s.owner)}`, "", `<a href="#/subscriptions">Subscriptions</a> /`) + `
      <div class="kpis">
        <div class="kpi"><div class="kpi-label">Annual cost</div><div class="kpi-value">${usd(s.annualCost)}</div><div class="kpi-sub">${s.perSeatMonthly ? `$${s.perSeatMonthly}/seat/month` : "Flat platform fee"}</div></div>
        <div class="kpi"><div class="kpi-label">Seats</div><div class="kpi-value">${s.seats ?? "—"}</div><div class="kpi-sub">${s.seats ? `${s.assignedCount} assigned · ${s.unassignedSeats} unassigned` : "Not seat-based"}</div></div>
        <div class="kpi"><div class="kpi-label">Renewal</div><div class="kpi-value" style="font-size:20px">${date(s.renewal)}</div><div class="kpi-sub">${s.daysToRenewal} days · ${s.autoRenew ? "auto-renews" : "manual renewal"}</div></div>
        <div class="kpi"><div class="kpi-label">Notice deadline</div><div class="kpi-value" style="font-size:20px">${s.noticeDeadline ? date(s.noticeDeadline) : "Unknown"}</div><div class="kpi-sub">${s.noticeDays != null ? `${s.noticeDays}-day notice` : "Not found in contract"}</div></div>
      </div>
      <div class="grid g-main">
        <div class="stack">
          <section class="panel"><div class="panel-head"><h2>Utilization</h2>${s.seats ? usageLegend() : ""}</div><div class="panel-body">
            ${usageBar(s)}
            <p class="small" style="margin-top:12px">${esc(u.statement)}</p>
            ${u.status === "imported" ? `<p class="xs muted">Source: ${esc(u.source)} · file ${esc(u.filename)} · period ${date(u.periodStart)} – ${date(u.periodEnd)} · imported ${date(u.importedAt.slice(0, 10))} by ${esc(u.importedBy)}</p>${u.issues.length ? `<div class="callout callout-warn">${ICON.alert}<div>${u.issues.map(esc).join("<br>")}</div></div>` : ""}` : s.seats ? `<a class="btn btn-ghost btn-sm" href="#/imports">Import a usage report</a>` : ""}
          </div></section>
          <section class="panel"><div class="panel-head"><h2>Recommendations</h2></div>
            ${recs.length ? recs.map(recCard).join("") : '<div class="empty">No recommendations for this subscription.</div>'}
          </section>
          <section class="panel"><div class="panel-head"><h2>Invoice history</h2><span class="xs muted">${esc(BASE.meta.sources.ap.name)}</span></div><div class="table-wrap"><table class="data">
            <thead><tr><th>Quarter</th><th>Invoice</th><th class="r">Seats</th><th class="r">Amount</th></tr></thead>
            <tbody>${inv.map((i) => `<tr><td>${i.quarter}</td><td class="mono">${esc(i.invoiceRef)}</td><td class="r num">${i.seats ?? "—"}</td><td class="r num">${usd(i.amount)}</td></tr>`).join("")}</tbody>
          </table></div></section>
        </div>
        <div class="stack">
          ${alerts.length ? `<section class="panel"><div class="panel-head"><h2>Renewal risk</h2></div><div class="panel-body">${alerts.map((a) => `<div style="margin-bottom:10px">${sevLabel(a.severity)}<div class="small">${esc(a.message)}</div></div>`).join("")}</div></section>` : ""}
          ${contractPanel(s)}
        </div>
      </div>`;
  }

  function contractPanel(s) {
    if (!s.contract) return `<section class="panel"><div class="panel-head"><h2>Contract</h2></div><div class="panel-body"><div class="callout callout-warn">${ICON.alert}<div>No contract document on file. Upload the signed order form so renewal terms can be extracted and verified.</div></div></div></section>`;
    const f = s.contract.fields;
    const names = { subscriptionName: "Product", seats: "Seats", annualCost: "Annual cost", termMonths: "Term (months)", renewalDate: "Renewal date", autoRenew: "Auto-renewal", noticeDays: "Notice period (days)", priceIncreaseCap: "Price-increase cap" };
    const val = (v) => v === true ? "Yes" : v === false ? "No" : v == null ? "Not found" : typeof v === "number" && v > 999 ? usd(v) : esc(v);
    return `<section class="panel"><div class="panel-head"><h2>Extracted contract terms</h2><span class="badge badge-info">AI extraction</span></div><div class="panel-body">
      <div class="xs muted" style="margin-bottom:8px">${esc(s.contract.document)} · extracted ${date(s.contract.extractedAt.slice(0, 10))}${s.contract.reviewedBy ? ` · reviewed by ${esc(s.contract.reviewedBy)}` : " · not yet human-reviewed"}</div>
      ${Object.entries(f).map(([key, x]) => `<div class="fieldrow"><div class="fl">${names[key] || key}</div><div><b>${val(x.value)}</b><div class="xs muted">${x.page ? `p.${x.page}: ` : ""}“${esc(x.snippet)}”</div></div><div class="xs conf-${x.confidence}">${x.confidence === "none" ? "Missing" : x.confidence}</div></div>`).join("")}
    </div></section>`;
  }

  views.vendors = function () {
    const rows = A.subscriptions.slice().sort((a, b) => a.vendor.localeCompare(b.vendor));
    const missing = A.renewalAlerts.filter((a) => a.kind === "missing_field" || a.kind === "missing_contract");
    return head("Vendors & contract register", "Terms extracted from uploaded contracts by Amazon Bedrock. Each value links back to the passage it came from. Missing terms are flagged, never guessed.") + `
      ${missing.length ? `<div class="callout callout-warn" style="margin-bottom:16px">${ICON.alert}<div><b>${plural(missing.length, "contract gap")} found.</b> ${missing.map((m) => `${esc(A.subById[m.subscriptionId].name)}: ${esc(m.message)}`).join(" · ")}</div></div>` : ""}
      <section class="panel"><div class="table-wrap"><table class="data">
        <thead><tr><th>Vendor</th><th>Product</th><th>Document</th><th class="r">Term</th><th>Auto-renew</th><th class="r">Notice</th><th>Price cap</th><th>Review</th></tr></thead>
        <tbody>${rows.map((s) => { const f = s.contract && s.contract.fields; return `<tr class="clickable" data-href="#/subscriptions/${s.id}">
          <td>${esc(s.vendor)}</td><td><b>${esc(s.name)}</b></td>
          <td>${s.contract ? `<span class="mono">${esc(s.contract.document)}</span>` : '<span class="badge badge-crit">No contract on file</span>'}</td>
          <td class="r num">${f ? f.termMonths.value + " mo" : "—"}</td>
          <td>${f ? (f.autoRenew.value ? "Yes" : "No") : "—"}</td>
          <td class="r num">${f ? (f.noticeDays.value != null ? f.noticeDays.value + " days" : '<span class="conf-none">Not found</span>') : "—"}</td>
          <td>${f ? (f.priceIncreaseCap.value ? esc(f.priceIncreaseCap.value) : '<span class="conf-none">Not found</span>') : "—"}</td>
          <td>${s.contract ? (s.contract.reviewedBy ? '<span class="badge badge-good">Reviewed</span>' : '<span class="badge">Unreviewed</span>') : "—"}</td>
        </tr>`; }).join("")}</tbody>
      </table></div></section>`;
  };

  let licFilter = { dept: "", status: "", q: "" };
  views.licenses = function () {
    const subs = A.subscriptions.filter((s) => s.seats);
    const depts = [...new Set(BASE.employees.map((e) => e.department))];
    const list = BASE.employees.filter((e) => (!licFilter.dept || e.department === licFilter.dept) && (!licFilter.status || e.status === licFilter.status) && (!licFilter.q || e.name.toLowerCase().includes(licFilter.q.toLowerCase())));
    const cell = (s, e) => {
      if (!s.assignedIds.includes(e.id)) return "";
      if (s.usage.status !== "imported") return `<span class="dot dot-unknown" data-tip="${esc(e.name)} · ${esc(s.name)} · assigned · usage not imported"></span>`;
      const act = s.usage.activeIds.includes(e.id);
      return `<span class="dot ${act ? "dot-active" : "dot-inactive"}" data-tip="${esc(e.name)} · ${esc(s.name)} · ${act ? "active in window" : "no activity in window"}"></span>`;
    };
    const termCount = BASE.employees.filter((e) => e.status === "terminated").length;
    return head("Employee-to-license mapping", `Assignments from the identity-provider export, employment status from the HRIS roster, activity from imported usage reports. ${termCount} departed employees are highlighted.`) + `
      <div class="filters">
        <input class="input" id="lf-q" type="search" placeholder="Search name…" value="${esc(licFilter.q)}" aria-label="Search employees">
        <select class="input" id="lf-dept" aria-label="Department"><option value="">All departments</option>${depts.map((d) => `<option ${licFilter.dept === d ? "selected" : ""}>${esc(d)}</option>`).join("")}</select>
        <div class="seg-ctl" role="group" aria-label="Employment status">${[["", "All"], ["active", "Active"], ["terminated", "Departed"]].map(([v, l]) => `<button data-status="${v}" aria-pressed="${licFilter.status === v}">${l}</button>`).join("")}</div>
        <div class="legend"><span><i class="dot dot-active"></i>Assigned, active</span><span><i class="dot dot-inactive"></i>Assigned, no activity</span><span><i class="dot dot-unknown"></i>Assigned, usage not imported</span></div>
      </div>
      <section class="panel"><div class="table-wrap" style="max-height:70vh"><table class="data matrix">
        <thead><tr><th>Employee</th><th>Department</th>${subs.map((s) => `<th class="rot">${esc(s.name)}</th>`).join("")}<th class="r">Licenses</th><th class="r">Annual cost</th></tr></thead>
        <tbody>${list.map((e) => {
          const held = subs.filter((s) => s.assignedIds.includes(e.id));
          return `<tr class="${e.status === "terminated" ? "term" : ""}"><td class="name"><b>${esc(e.name)}</b>${e.status === "terminated" ? ` <span class="badge badge-warn">Departed ${date(e.terminatedOn)}</span>` : ""}</td><td class="small">${esc(e.department)}</td>${subs.map((s) => `<td class="cell">${cell(s, e)}</td>`).join("")}<td class="r num">${held.length}</td><td class="r num">${usd(held.reduce((a, s) => a + s.perSeatAnnual, 0))}</td></tr>`;
        }).join("") || `<tr><td colspan="${subs.length + 4}" class="empty">No employees match.</td></tr>`}</tbody>
      </table></div></section>`;
  };

  let pendingPreview = null;
  views.imports = function () {
    const imps = dataset().imports.slice().sort((a, b) => b.importedAt.localeCompare(a.importedAt));
    const seatSubs = A.subscriptions.filter((s) => s.seats);
    const missing = seatSubs.filter((s) => s.usage.status !== "imported");
    return head("Usage data imports", "Vendor activity exports uploaded by your team. SeatSignal reports utilization only for subscriptions listed here. Everything else stays “unknown”.") + `
      <div class="grid g-main">
        <div class="stack">
          <section class="panel"><div class="panel-head"><h2>Imported reports</h2><span class="xs muted">${imps.length} reports</span></div><div class="table-wrap"><table class="data">
            <thead><tr><th>Subscription</th><th>File &amp; source</th><th>Period</th><th class="r">Rows</th><th class="r">Unmatched</th><th>Imported</th></tr></thead>
            <tbody>${imps.map((i) => { const s = A.subById[i.subscriptionId]; const u = s.usage.importId === i.id ? s.usage : null; return `<tr class="clickable" data-href="#/subscriptions/${s.id}">
              <td><b>${esc(s.name)}</b>${i.userImported ? ' <span class="badge badge-info">Added in demo</span>' : ""}</td>
              <td><span class="mono">${esc(i.filename)}</span><div class="xs muted">${esc(i.source)}</div></td>
              <td class="num small">${date(i.periodStart)} – ${date(i.periodEnd)}${daysSpan(i) < 60 ? '<div class="xs conf-medium">Short window</div>' : ""}</td>
              <td class="r num">${i.rows.length}</td><td class="r num">${u ? u.unmatchedEmails.length : "—"}</td>
              <td class="small">${date(i.importedAt.slice(0, 10))}<div class="xs muted">${esc(i.importedBy)}</div></td></tr>`; }).join("")}</tbody>
          </table></div></section>
          <section class="panel"><div class="panel-head"><h2>No usage data yet</h2></div><div class="panel-body">
            ${missing.length ? `<p class="small">For these subscriptions, SeatSignal makes <b>no claim about usage</b>. Recommendations are limited to contract and assignment facts.</p>
            <ul class="gap-list">${missing.map((s) => `<li><b>${esc(s.name)}</b> — ${s.seats} seats, ${usd(s.annualCost)}/yr, renews ${date(s.renewal)}</li>`).join("")}</ul>` : '<p class="small">Every seat-based subscription has an imported usage report.</p>'}
          </div></section>
        </div>
        <div class="stack">
          <section class="panel"><div class="panel-head"><h2>Import a usage report</h2></div><div class="panel-body">
            <form id="imp-form" novalidate>
              <div class="field"><label for="imp-sub">Subscription</label><select class="input" id="imp-sub" required>${seatSubs.map((s) => `<option value="${s.id}" ${s.id === (pendingPreview ? pendingPreview.subscriptionId : "taskt") ? "selected" : ""}>${esc(s.name)}${s.usage.status === "imported" ? "" : " (no usage data)"}</option>`).join("")}</select></div>
              <div class="grid g-2" style="gap:10px">
                <div class="field"><label for="imp-start">Period start</label><input class="input" type="date" id="imp-start" value="${pendingPreview ? pendingPreview.periodStart : "2026-07-01"}" required></div>
                <div class="field"><label for="imp-end">Period end</label><input class="input" type="date" id="imp-end" value="${pendingPreview ? pendingPreview.periodEnd : "2026-09-30"}" required></div>
              </div>
              <div class="field"><label for="imp-source">Source description</label><input class="input" id="imp-source" value="${esc(pendingPreview ? pendingPreview.source : "Vendor admin console → user activity export (CSV)")}"></div>
              <div class="dropzone" id="dropzone">
                <p class="small" style="margin-bottom:8px">CSV with columns <span class="mono">email, last_active_date</span> (optional <span class="mono">active_days_in_period</span>)</p>
                <label class="btn btn-ghost btn-sm" for="imp-file">Choose CSV file</label><input type="file" id="imp-file" accept=".csv,text/csv" class="sr-only">
                <p class="xs muted" style="margin:8px 0 0">or <button type="button" class="link-btn" id="imp-sample" style="color:var(--navy-700);text-decoration:underline;font-size:12px">load the sample TaskTrack report</button> (<a href="sample-data/${esc(BASE.pendingImport.filename)}" download>download CSV</a>)</p>
              </div>
              <div id="imp-preview">${pendingPreview ? previewHtml(pendingPreview) : ""}</div>
            </form>
          </div></section>
          <div class="callout callout-info">${ICON.info}<div>In production, files are uploaded to Amazon S3 and parsed by the <span class="mono">usage-import</span> Lambda. Authorized integrations can replace manual exports, using read-only scopes.</div></div>
        </div>
      </div>`;
  };
  const daysSpan = (i) => E.daysBetween(i.periodStart, i.periodEnd) + 1;

  function previewHtml(p) {
    const s = A.subById[p.subscriptionId];
    const emails = new Set(BASE.employees.map((e) => e.email.toLowerCase()));
    const matched = p.rows.filter((r) => emails.has(r.email)).length;
    const withDate = p.rows.filter((r) => r.last_active_date).length;
    return `<div style="margin-top:14px">
      <div class="small"><b>Preview: ${esc(p.filename)}</b> for ${esc(s.name)}</div>
      ${p.errors.length ? `<div class="callout callout-warn" style="margin-top:8px">${ICON.alert}<div>${p.errors.slice(0, 5).map(esc).join("<br>")}${p.errors.length > 5 ? `<br>…and ${p.errors.length - 5} more` : ""}</div></div>` : ""}
      <div class="preview-stats"><div><span class="xs muted">Rows</span><b>${p.rows.length}</b></div><div><span class="xs muted">Matched to HRIS</span><b>${matched}</b></div><div><span class="xs muted">Unmatched</span><b>${p.rows.length - matched}</b></div><div><span class="xs muted">With activity date</span><b>${withDate}</b></div></div>
      <p class="xs muted">Nothing changes in your systems. Importing only adds this evidence to SeatSignal's analysis.</p>
      <div class="wf-actions"><button type="button" class="btn btn-accent btn-sm" id="imp-confirm" ${p.rows.length ? "" : "disabled"}>Import ${p.rows.length} rows</button><button type="button" class="btn btn-ghost btn-sm" id="imp-cancel">Discard</button></div>
    </div>`;
  }

  views.renewals = function () {
    const months = [];
    const start = new Date(A.asOf.slice(0, 7) + "-01T00:00:00Z");
    for (let i = 0; i < 9; i++) { const d = new Date(start); d.setUTCMonth(d.getUTCMonth() + i); months.push(d.toISOString().slice(0, 7)); }
    const events = [];
    for (const s of A.subscriptions) {
      events.push({ date: s.renewal, kind: "renew", s });
      if (s.noticeDeadline) events.push({ date: s.noticeDeadline, kind: "notice", s });
    }
    const alertsBy = {};
    A.renewalAlerts.forEach((a) => { (alertsBy[a.subscriptionId] = alertsBy[a.subscriptionId] || []).push(a); });
    return head("Renewal calendar", "Renewal dates and notice deadlines from extracted contract terms. Scheduled checks (AWS Lambda) re-evaluate these every day.") + `
      <section class="panel" style="margin-bottom:16px"><div class="panel-head"><h2>Renewal risk alerts</h2><span class="xs muted">${A.renewalAlerts.length} alerts</span></div><div class="table-wrap"><table class="data">
        <thead><tr><th>Severity</th><th>Subscription</th><th>Issue</th><th>Due</th></tr></thead>
        <tbody>${A.renewalAlerts.map((a) => `<tr class="clickable" data-href="#/subscriptions/${a.subscriptionId}"><td>${sevLabel(a.severity)}</td><td><b>${esc(A.subById[a.subscriptionId].name)}</b></td><td class="small">${esc(a.message)}</td><td class="num small">${date(a.due)}</td></tr>`).join("")}</tbody>
      </table></div></section>
      <div class="legend" style="margin-bottom:10px"><span><b style="color:var(--warning)">●</b> Notice deadline</span><span><b style="color:var(--navy-700)">●</b> Renewal date</span></div>
      <div class="cal">${months.map((m) => {
        const evs = events.filter((e) => e.date.startsWith(m)).sort((a, b) => a.date.localeCompare(b.date));
        const value = evs.filter((e) => e.kind === "renew").reduce((a, e) => a + e.s.annualCost, 0);
        const label = new Date(m + "-01T00:00:00Z").toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
        return `<div class="cal-month"><h3><span>${label}</span><span class="xs muted num">${value ? usd(value) + " renewing" : ""}</span></h3>
          ${evs.map((e) => `<a class="cal-ev ${e.kind}" href="#/subscriptions/${e.s.id}"><span class="cal-day">${e.date.slice(8)}</span><span><b>${esc(e.s.name)}</b> <span class="k">${e.kind === "renew" ? `renews · ${usd(e.s.annualCost)}${e.s.autoRenew ? " · auto" : ""}` : "notice deadline"}</span>${(alertsBy[e.s.id] || []).some((a) => a.kind === "missing_contract" || (a.kind === "missing_field" && e.kind === "renew")) ? ' <span class="badge badge-warn">terms incomplete</span>' : ""}</span></a>`).join("") || '<div class="xs muted">Nothing scheduled</div>'}
        </div>`;
      }).join("")}</div>`;
  };

  views.costs = function () {
    const byCat = {};
    A.subscriptions.forEach((s) => { byCat[s.category] = (byCat[s.category] || 0) + s.annualCost; });
    const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
    const max = cats[0][1];
    const qTotals = BASE.quarters.map((q) => ({ q, v: BASE.invoices.filter((i) => i.quarter === q).reduce((a, i) => a + i.amount, 0) }));
    const qMax = Math.max(...qTotals.map((x) => x.v));
    const perEmp = A.totals.annualSpend / BASE.employees.filter((e) => e.status === "active").length;
    return head("Cost analysis", "Spend from contracts and the accounts-payable invoice export. Anomalies are found in recorded invoice history only.") + `
      <div class="kpis">
        <div class="kpi"><div class="kpi-label">Annual run-rate</div><div class="kpi-value">${usd(A.totals.annualSpend)}</div><div class="kpi-sub">current contracts</div></div>
        <div class="kpi"><div class="kpi-label">Per active employee</div><div class="kpi-value">${usd(perEmp)}</div><div class="kpi-sub">per year</div></div>
        <div class="kpi"><div class="kpi-label">Latest quarter invoiced</div><div class="kpi-value">${usd(qTotals[qTotals.length - 1].v)}</div><div class="kpi-sub">${qTotals[qTotals.length - 1].q} · ${(((qTotals[qTotals.length - 1].v - qTotals[0].v) / qTotals[0].v) * 100).toFixed(0)}% vs ${qTotals[0].q}</div></div>
      </div>
      <div class="grid g-2">
        <section class="panel"><div class="panel-head"><h2>Annual spend by category</h2></div><div class="panel-body"><div class="hbars">
          ${cats.map(([c, v]) => `<div class="hbar"><span class="small">${esc(c)}</span><div class="hbar-track"><div class="hbar-fill" style="width:${(v / max) * 100}%" data-tip="${esc(c)}: ${usd(v)}/yr · ${A.subscriptions.filter((s) => s.category === c).map((s) => esc(s.name)).join(", ")}"></div></div><span class="val small">${k(v)}</span></div>`).join("")}
        </div></div></section>
        <section class="panel"><div class="panel-head"><h2>Quarterly invoiced spend</h2></div><div class="panel-body">
          <div class="cols">${qTotals.map((x, i) => `<div class="col"><span class="col-val">${i === qTotals.length - 1 || i === 0 ? k(x.v) : ""}</span><div class="col-fill" style="height:${(x.v / qMax) * 85}%" data-tip="${x.q}: ${usd(x.v)} invoiced"></div></div>`).join("")}</div>
          <div class="col-labels">${qTotals.map((x) => `<span>${x.q}</span>`).join("")}</div>
          <details class="small" style="margin-top:12px"><summary>View as table</summary><table class="mini-table" style="margin-top:8px"><thead><tr><th>Quarter</th><th>Invoiced</th><th>Headcount</th></tr></thead><tbody>${qTotals.map((x) => `<tr><td>${x.q}</td><td class="num">${usd(x.v)}</td><td class="num">${BASE.headcountByQuarter[x.q]}</td></tr>`).join("")}</tbody></table></details>
        </div></section>
      </div>
      <section class="panel" style="margin-top:16px"><div class="panel-head"><h2>Spend anomalies</h2><span class="xs muted">Unit price change ≥ ${A.config.unitPriceChangePct}% or seat growth ≥ ${A.config.seatGrowthOverHeadcountPts} pts above headcount growth</span></div><div class="table-wrap"><table class="data">
        <thead><tr><th>Subscription</th><th>Quarter</th><th>Finding</th><th class="r">Cost Δ</th><th class="r">Seat Δ</th><th class="r">Headcount Δ</th><th>Evidence</th></tr></thead>
        <tbody>${A.anomalies.map((x) => `<tr class="clickable" data-href="#/subscriptions/${x.subscriptionId}"><td><b>${esc(A.subById[x.subscriptionId].name)}</b></td><td>${x.quarter}</td><td class="small">${esc(x.title)}<div class="xs muted">${esc(x.detail)}</div></td><td class="r num">${x.costPct >= 0 ? "+" : ""}${x.costPct.toFixed(0)}%</td><td class="r num">${x.seatPct >= 0 ? "+" : ""}${x.seatPct.toFixed(0)}%</td><td class="r num">${x.hcPct >= 0 ? "+" : ""}${x.hcPct.toFixed(1)}%</td><td class="mono xs">${x.evidence.map(esc).join("<br>")}</td></tr>`).join("")}</tbody>
      </table></div></section>`;
  };

  let recFilter = "all";
  views.recommendations = function (id) {
    if (id) return recDetail(decodeURIComponent(id));
    const types = ["all", "rightsize", "departed", "unassigned", "overlap", "usage_gap"];
    const list = A.recommendations.filter((r) => recFilter === "all" || r.type === recFilter);
    return head("AI recommendations", "Ranked by decision deadline. Each recommendation is a proposal for investigation. It lists its evidence, confidence and data gaps, and changes nothing until a person approves and acts.") + `
      <div class="filters"><div class="seg-ctl" role="group" aria-label="Filter by type">${types.map((t) => `<button data-rtype="${t}" aria-pressed="${recFilter === t}">${t === "all" ? "All" : TYPE_LABEL[t]} <span class="muted">${t === "all" ? A.recommendations.length : A.recommendations.filter((r) => r.type === t).length}</span></button>`).join("")}</div></div>
      <section class="panel">${list.map(recCard).join("") || '<div class="empty">No recommendations of this type.</div>'}</section>`;
  };

  function recCard(r) {
    const s = A.subById[r.subscriptionId];
    return `<a class="rec" href="#/recommendations/${encodeURIComponent(r.id)}">
      <div class="rec-top">${r.featured ? '<span class="badge featured-flag">Walkthrough</span>' : ""}<span class="type-tag">${TYPE_LABEL[r.type]}</span>${statusChip(r.id)}${confBadge(r.confidence)}</div>
      <h3>${esc(r.title)}</h3><p>${esc(r.summary)}</p>
      <div class="rec-meta"><span>Decide by <b>${date(r.dueDate)}</b></span><span>${estText(r)}</span><span>${plural(r.evidence.length, "evidence item")} · ${plural(r.dataGaps.length, "data gap")}</span><span>${esc(s.name)} · ${usd(s.annualCost)}/yr</span></div>
    </a>`;
  }

  function narrative(r) {
    // Demo stand-in for the Bedrock narrative: composed only from engine-computed facts.
    const s = A.subById[r.subscriptionId];
    if (r.type === "rightsize") {
      const u = s.usage;
      return `${s.name} renews on ${date(s.renewal)} for ${usd(s.annualCost)} (${s.seats} seats). In the imported ${u.filename} report, ${u.activeIds.length} of the ${s.assignedCount} assigned users were active between ${date(u.windowStart)} and ${date(u.periodEnd)}; ${s.terminatedAssignedIds.length} assigned users have left the company according to the HRIS roster, and ${s.unassignedSeats} seats are not assigned to anyone. If the ${s.owner} owner confirms the inactive users do not need access, reducing to ${r.proposal.proposedSeatsRange[0]}–${r.proposal.proposedSeatsRange[1]} seats would lower the annual cost by an estimated ${rng(r.estimate.low, r.estimate.high)} at current pricing. ${s.noticeDeadline ? `Any change has to be notified to the vendor by ${date(s.noticeDeadline)}.` : ""} This estimate is unverified until the renewal order is amended.`;
    }
    return `${r.summary} ${r.estimate ? `Estimated value: ${rng(r.estimate.low, r.estimate.high)} per year (unverified).` : esc(r.estimateNote || "")}`;
  }

  function recDetail(id) {
    const r = A.recommendations.find((x) => x.id === id);
    if (!r) return notFound("This recommendation no longer applies. The underlying data may have changed after a new import.");
    const s = A.subById[r.subscriptionId];
    const wf = wfOf(r.id);
    return head(esc(r.title), `${TYPE_LABEL[r.type]} · ${esc(s.name)} · decide by ${date(r.dueDate)}`, workflowButtons(r), `<a href="#/recommendations">AI recommendations</a> /`) + `
      <div class="grid g-main">
        <div class="stack">
          <section class="panel"><div class="panel-head"><h2>Summary</h2><div style="display:flex;gap:6px;flex-wrap:wrap">${statusChip(r.id)}${confBadge(r.confidence)}</div></div><div class="panel-body">
            <div class="ai-note">${ICON.spark}<span>Narrative drafted from the evidence below. Demo: composed locally. Production: Amazon Bedrock, constrained to these facts.</span></div>
            <div class="narrative">${esc(narrative(r))}</div>
            ${r.type === "rightsize" ? `<div style="margin-top:14px">${usageBar(s)}<div style="margin-top:8px">${usageLegend()}</div></div>` : ""}
          </div></section>
          ${r.type === "rightsize" ? evidenceTrail(r, s) : ""}
          <section class="panel"><div class="panel-head"><h2>Evidence</h2><span class="xs muted">What supports this recommendation</span></div><div class="panel-body" style="padding-top:4px;padding-bottom:4px">
            <ul class="ev-list">${r.evidence.map((e) => `<li class="ev-item"><span class="ev-type ev-${e.type}">${{ contract: "Contract", usage_import: "Usage import", hris: "HRIS", license_mapping: "License map", invoice: "Invoice" }[e.type]}</span><div>${esc(e.detail)}<div class="ev-src">Source: <span class="mono">${esc(e.source)}</span></div>${e.ref ? `<div class="ev-ref">${esc(e.ref)}</div>` : ""}</div></li>`).join("")}</ul>
          </div></section>
        </div>
        <div class="stack">
          <section class="panel"><div class="panel-head"><h2>Estimated opportunity</h2><span class="badge">Unverified</span></div><div class="panel-body">
            ${r.estimate ? `<div class="kpi-value">${rng(r.estimate.low, r.estimate.high)} <span class="small muted" style="font-weight:500">/ yr</span></div><p class="xs muted" style="margin-top:6px">${esc(r.estimate.method)}</p>` : `<p class="small muted">${esc(r.estimateNote || "Not estimated.")}</p>`}
            ${wf.status === "verified" ? `<div class="callout callout-info" style="margin-top:8px">${ICON.check}<div><b>Verified: ${usd(wf.verifiedAmount)}/yr</b><br>${esc(wf.verificationRef)}</div></div>` : ""}
          </div></section>
          <section class="panel"><div class="panel-head"><h2>Confidence: ${esc(r.confidence.level)}</h2></div><div class="panel-body"><ul class="gap-list">${r.confidence.reasons.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div></section>
          <section class="panel"><div class="panel-head"><h2>Data gaps &amp; limitations</h2></div><div class="panel-body">${r.dataGaps.length ? `<ul class="gap-list">${r.dataGaps.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : '<p class="small muted">None identified.</p>'}</div></section>
          <section class="panel"><div class="panel-head"><h2>Suggested next steps</h2></div><div class="panel-body"><ol class="gap-list">${r.nextSteps.map((x) => `<li>${esc(x)}</li>`).join("")}</ol></div></section>
          <div class="callout callout-guard">${ICON.shield}<div><strong>No automatic action.</strong> ${esc(r.guardrail)}</div></div>
          <section class="panel"><div class="panel-head"><h2>Decision history</h2></div><div class="panel-body">${wf.history.length ? `<ul class="history">${wf.history.slice().reverse().map((h) => `<li><b>${esc(h.action)}</b> — ${esc(h.by)}<div class="when">${new Date(h.at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</div>${h.note ? `<div class="small">${esc(h.note)}</div>` : ""}</li>`).join("")}</ul>` : '<p class="small muted">No decisions yet.</p>'}</div></section>
        </div>
      </div>`;
  }

  function evidenceTrail(r, s) {
    const u = s.usage;
    const c = s.contract;
    const rows = BASE.imports.concat(userImports).find((i) => i.id === u.importId).rows;
    const byEmail = Object.fromEntries(BASE.employees.map((e) => [e.email.toLowerCase(), e]));
    const sampleActive = rows.filter((x) => { const e = byEmail[x.email]; return e && u.activeIds.includes(e.id); }).slice(0, 3);
    const inactiveRows = rows.filter((x) => { const e = byEmail[x.email]; return e && u.inactiveIds.includes(e.id); });
    const departedRow = inactiveRows.find((x) => byEmail[x.email].status === "terminated");
    const sampleInactive = (departedRow ? [departedRow] : []).concat(inactiveRows.filter((x) => x !== departedRow).slice(0, 3));
    const rowHtml = (x, cls) => { const e = byEmail[x.email]; return `<tr class="${cls}"><td class="mono">${esc(x.email)}</td><td class="num">${x.last_active_date || '<span class="muted">none</span>'}</td><td>${e.status === "terminated" ? `<span class="badge badge-warn">Departed</span>` : "Employed"}</td><td>${cls === "row-active" ? "Active" : "No activity"}</td></tr>`; };
    const A_ = u.observedActive, [t, cons] = r.proposal.proposedSeatsRange;
    return `<section class="panel"><div class="panel-head"><h2>Evidence trail — how this was reached</h2><span class="badge badge-sample">SAMPLE DATA</span></div><div class="panel-body"><ol class="trail">
      <li><h3>Contract terms extracted</h3><p>Amazon Bedrock read <span class="mono">${esc(c ? c.document : "—")}</span> and returned each field with the passage it came from. ${c && c.reviewedBy ? `A person (${esc(c.reviewedBy)}) confirmed the fields.` : ""}</p>
        ${c && c.excerpt ? `<div class="doc">${c.excerpt.map((l) => /60 named user|Renewal date|§3\.2|§3\.4|USD 15,840/.test(l) ? `<mark>${esc(l)}</mark>` : esc(l)).join("<br>")}</div>` : ""}</li>
      <li><h3>Licenses mapped to people</h3><p>The identity-provider export shows <b>${s.assignedCount}</b> of <b>${s.seats}</b> licenses assigned. Matching against the HRIS roster finds <b>${s.terminatedAssignedIds.length}</b> assignees who have left: ${s.terminatedAssignedIds.map((id) => `${esc(empById[id].name)} (${date(empById[id].terminatedOn)})`).join(", ")}.</p></li>
      <li><h3>Usage report imported</h3><p><span class="mono">${esc(u.filename)}</span> (${esc(u.source)}) covers ${date(u.periodStart)} – ${date(u.periodEnd)}. A user counts as <b>active</b> if the vendor recorded activity in the last ${u.windowDays} days of that period (from ${date(u.windowStart)}) and they are still employed.</p>
        <div class="table-wrap"><table class="mini-table"><thead><tr><th>email (from report)</th><th>last_active_date</th><th>HRIS status</th><th>Classified as</th></tr></thead><tbody>${sampleActive.map((x) => rowHtml(x, "row-active")).join("")}${sampleInactive.map((x) => rowHtml(x, "row-inactive")).join("")}</tbody></table></div>
        <p class="xs muted" style="margin-top:6px">Showing ${sampleActive.length + sampleInactive.length} of ${u.rowCount} rows. ${u.unmatchedEmails.length} unmatched rows, ${u.notInExportIds.length} assigned users missing from the report.</p></li>
      <li><h3>Seats needed, calculated</h3><p>The engine computes the result deterministically. The language model never produces these numbers.</p>
        <div class="calc">observed active users       = <b>${A_}</b>
purchased seats             = ${s.seats}   →  utilization ${pct(A_ / s.seats)} (review threshold ${pct(A.config.rightsizeThreshold)})
proposed seats (+${Math.round(A.config.bufferTarget * 100)}% … +${Math.round(A.config.bufferConservative * 100)}% buffer) = <b>${t} … ${cons}</b>
estimate  = (${s.seats} − ${cons}) × $${s.perSeatAnnual}  …  (${s.seats} − ${t}) × $${s.perSeatAnnual}
          = <b>${usd(r.estimate.low)} … ${usd(r.estimate.high)} per year</b>  (estimated, unverified)</div></li>
      <li><h3>What SeatSignal does not know</h3><ul class="gap-list">${r.dataGaps.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></li>
      <li><h3>A person decides</h3><p>The ${esc(s.owner)} owner and finance review this proposal${s.noticeDeadline ? ` before the ${date(s.noticeDeadline)} notice deadline` : ""}. If they approve, the system owner contacts the vendor. SeatSignal records the decision and, once the amended order arrives, the verified saving.</p></li>
    </ol></div></section>`;
  }

  function workflowButtons(r) {
    const st = wfOf(r.id).status;
    const b = (action, label, cls) => `<button class="btn ${cls} btn-sm" data-wf="${action}" data-rec="${esc(r.id)}">${label}</button>`;
    if (st === "open") return b("in_review", "Start review", "btn-primary");
    if (st === "in_review") return b("approved", "Approve for owner action", "btn-accent") + b("rejected", "Reject", "btn-ghost");
    if (st === "approved") return b("actioned", "Record owner action completed", "btn-primary") + b("open", "Reopen", "btn-ghost");
    if (st === "actioned") return b("verified", "Verify savings", "btn-accent");
    if (st === "rejected") return b("open", "Reopen", "btn-ghost");
    return "";
  }

  views.savings = function () {
    const sv = E.summarizeSavings(A.recommendations, workflow);
    const rows = A.recommendations.filter((r) => r.estimate || wfOf(r.id).status === "verified");
    return head("Savings opportunity tracker", "Estimated opportunities, approved actions and verified savings are tracked separately and never added together.") + `
      <div class="kpis">
        <div class="kpi est"><div class="kpi-label">Estimated — open <span class="badge">Estimate</span></div><div class="kpi-value">${rng(sv.estimatedOpen[0], sv.estimatedOpen[1])}</div><div class="kpi-sub">per year · recommendations not yet approved</div></div>
        <div class="kpi est"><div class="kpi-label">Approved — awaiting verification <span class="badge">Estimate</span></div><div class="kpi-value">${rng(sv.approvedPending[0], sv.approvedPending[1])}</div><div class="kpi-sub">per year · owner action approved or done, not yet confirmed</div></div>
        <div class="kpi verified"><div class="kpi-label">Verified savings</div><div class="kpi-value">${usd(sv.verified)}</div><div class="kpi-sub">per year · confirmed against an amended order, credit memo or invoice</div></div>
        <div class="kpi"><div class="kpi-label">Not estimated</div><div class="kpi-value">${sv.notEstimated}</div><div class="kpi-sub">recommendations without enough evidence to size</div></div>
      </div>
      <div class="callout callout-info" style="margin-bottom:16px">${ICON.info}<div>Ranges reflect different seat buffers and use current list prices. Some items may overlap. For example, unassigned seats in a tool that is later consolidated would be counted twice, so treat the open total as an upper bound for investigation, not a forecast.</div></div>
      <section class="panel"><div class="table-wrap"><table class="data">
        <thead><tr><th>Recommendation</th><th>Status</th><th class="r">Estimated / yr</th><th class="r">Verified / yr</th><th>Verification evidence</th></tr></thead>
        <tbody>${rows.map((r) => { const w = wfOf(r.id); return `<tr class="clickable" data-href="#/recommendations/${encodeURIComponent(r.id)}"><td><b>${esc(r.title)}</b><div class="xs muted">${TYPE_LABEL[r.type]} · ${esc(A.subById[r.subscriptionId].name)}</div></td><td>${statusChip(r.id)}</td><td class="r num">${r.estimate ? rng(r.estimate.low, r.estimate.high) : "—"}</td><td class="r num">${w.status === "verified" ? `<b style="color:var(--green-700)">${usd(w.verifiedAmount)}</b>` : "—"}</td><td class="small">${w.status === "verified" ? esc(w.verificationRef) : '<span class="muted">—</span>'}</td></tr>`; }).join("")}</tbody>
      </table></div></section>`;
  };

  views.approvals = function () {
    const groups = [["in_review", "In review"], ["approved", "Approved — awaiting owner action"], ["actioned", "Owner actioned — awaiting verification"], ["open", "Not started"]];
    const log = [];
    Object.entries(workflow).forEach(([id, w]) => (w.history || []).forEach((h) => log.push(Object.assign({ id }, h))));
    log.sort((a, b) => b.at.localeCompare(a.at));
    const title = (id) => { const r = A.recommendations.find((x) => x.id === id); return r ? r.title : id; };
    return head("Review & approval workflow", "Open → In review → Approved → Owner actioned → Verified. Approving records a decision. The change itself is made by the system owner outside SeatSignal.") + `
      <div class="grid g-main">
        <div class="stack">${groups.map(([st, label]) => {
          const list = A.recommendations.filter((r) => wfOf(r.id).status === st);
          return `<section class="panel"><div class="panel-head"><h2>${label}</h2><span class="xs muted">${list.length}</span></div>${list.length ? `<div class="table-wrap"><table class="data"><tbody>${list.map((r) => `<tr><td><a href="#/recommendations/${encodeURIComponent(r.id)}"><b>${esc(r.title)}</b></a><div class="xs muted">${TYPE_LABEL[r.type]} · decide by ${date(r.dueDate)} · ${r.estimate ? rng(r.estimate.low, r.estimate.high) + "/yr est." : "not estimated"}</div></td><td class="r"><div class="wf-actions" style="justify-content:flex-end">${workflowButtons(r)}</div></td></tr>`).join("")}</tbody></table></div>` : '<div class="empty">Nothing here.</div>'}</section>`;
        }).join("")}</div>
        <div class="stack">
          <div class="callout callout-guard">${ICON.shield}<div><strong>Separation of duties.</strong> SeatSignal proposes, people approve, and system owners carry out changes in the vendor's own console. SeatSignal holds no credentials that could disable accounts or cancel subscriptions.</div></div>
          <section class="panel"><div class="panel-head"><h2>Audit log</h2></div><div class="panel-body"><ul class="history">${log.slice(0, 25).map((h) => `<li><b>${esc(h.action)}</b> — ${esc(title(h.id))}<div class="when">${esc(h.by)} · ${new Date(h.at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</div>${h.note ? `<div class="small">${esc(h.note)}</div>` : ""}</li>`).join("") || '<li class="muted">No activity yet.</li>'}</ul></div></section>
        </div>
      </div>`;
  };

  views.report = function () {
    const t = A.totals;
    const sv = E.summarizeSavings(A.recommendations, workflow);
    const top = A.recommendations.filter((r) => r.estimate && wfOf(r.id).status !== "rejected" && wfOf(r.id).status !== "verified").sort((a, b) => b.estimate.high - a.estimate.high).slice(0, 5);
    const renewing = A.subscriptions.filter((s) => s.daysToRenewal >= 0 && s.daysToRenewal <= 90).sort((a, b) => a.renewal.localeCompare(b.renewal));
    const unknown = A.subscriptions.filter((s) => s.seats && s.usage.status !== "imported");
    const unknownSpend = unknown.reduce((a, s) => a + s.annualCost, 0);
    const crit = A.renewalAlerts.filter((a) => a.severity === "critical");
    return head("Executive report", "Generated from current workspace data. Print or save as PDF to share.", `<button class="btn btn-primary btn-sm" id="print-report">Print / save PDF</button>`) + `
      <article class="report">
        <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:flex-start"><div><p class="xs muted" style="margin:0">Halcyon Freight Co. · SaaS subscription review</p><h1>Software spend &amp; renewal outlook</h1><p class="small muted">Data as of ${date(A.asOf)} · prepared by SeatSignal</p></div><span class="badge badge-sample report-sample">SAMPLE DATA — FICTIONAL</span></div>
        <div class="ai-note">${ICON.spark}<span>Narrative drafted from computed figures. Demo: composed locally. Production: Amazon Bedrock with the same evidence payload, checked against the figures before publishing.</span></div>
        <div class="kpis">
          <div class="kpi"><div class="kpi-label">Annual spend</div><div class="kpi-value">${k(t.annualSpend)}</div></div>
          <div class="kpi"><div class="kpi-label">Renewing ≤ 90 days</div><div class="kpi-value">${k(t.renewing90Spend)}</div></div>
          <div class="kpi est"><div class="kpi-label">Estimated opportunity</div><div class="kpi-value">${rng(sv.estimatedOpen[0] + sv.approvedPending[0], sv.estimatedOpen[1] + sv.approvedPending[1])}</div></div>
          <div class="kpi verified"><div class="kpi-label">Verified savings</div><div class="kpi-value">${usd(sv.verified)}</div></div>
        </div>
        <h2>1. Spend</h2>
        <p>Halcyon runs ${t.subscriptionCount} SaaS subscriptions with an annual run-rate of ${usd(t.annualSpend)}. ${A.anomalies.length ? `Invoice history shows ${plural(A.anomalies.length, "anomaly")}: ${A.anomalies.map((x) => esc(x.title)).join("; ")}.` : "Invoice history shows no anomalies."}</p>
        <h2>2. Utilization evidence</h2>
        <p>Usage reports have been imported for ${t.subsWithUsage} of ${t.seatBasedCount} seat-based subscriptions, covering ${t.usageCoverageSpendPct}% of per-seat spend. For the remaining ${unknown.length} (${usd(unknownSpend)}/yr: ${unknown.map((s) => esc(s.name)).join(", ")}), <b>utilization is unknown</b>, and this report makes no claim about how they are used.</p>
        <h2>3. Renewal exposure (next 90 days)</h2>
        <table class="data"><thead><tr><th>Subscription</th><th>Renews</th><th>Notice by</th><th class="r">Annual value</th></tr></thead><tbody>${renewing.map((s) => `<tr><td>${esc(s.name)}</td><td>${date(s.renewal)}</td><td>${s.noticeDeadline ? date(s.noticeDeadline) : "Unknown"}</td><td class="r num">${usd(s.annualCost)}</td></tr>`).join("")}</tbody></table>
        ${crit.length ? `<p><b>Critical items:</b> ${crit.map((a) => `${esc(A.subById[a.subscriptionId].name)} — ${esc(a.message)}`).join(" ")}</p>` : ""}
        <h2>4. Proposed actions for review</h2>
        <table class="data"><thead><tr><th>Action</th><th>Confidence</th><th>Decide by</th><th class="r">Estimated / yr</th></tr></thead><tbody>${top.map((r) => `<tr><td>${esc(r.title)}</td><td>${esc(r.confidence.level)}</td><td>${date(r.dueDate)}</td><td class="r num">${rng(r.estimate.low, r.estimate.high)}</td></tr>`).join("")}</tbody></table>
        <p>${A.recommendations.filter((r) => r.type === "usage_gap").length} further subscriptions need usage data before a decision can be made. ${A.recommendations.filter((r) => r.type === "overlap").length} overlap investigations are open and have not been sized.</p>
        <h2>5. Savings status</h2>
        <ul><li><b>Verified:</b> ${usd(sv.verified)} per year, confirmed against vendor documents.</li><li><b>Approved, awaiting verification:</b> ${rng(sv.approvedPending[0], sv.approvedPending[1])} per year (estimate).</li><li><b>Open opportunities:</b> ${rng(sv.estimatedOpen[0], sv.estimatedOpen[1])} per year (estimate, may overlap; upper bound for investigation).</li></ul>
        <h2>6. Limitations</h2>
        <p>Estimates use current list prices and the vendor's own definition of activity. They are not commitments. SeatSignal has not changed any account or subscription; every action above needs owner approval and is carried out by the system owner.</p>
      </article>`;
  };

  function notFound(msg) { return head("Not found", msg || "That page doesn't exist.") + '<a class="btn btn-ghost" href="#/overview">Back to overview</a>'; }

  // ---------- workflow dialog ----------
  function openWorkflowDialog(recId, next) {
    const r = A.recommendations.find((x) => x.id === recId);
    const labels = { in_review: "Start review", approved: "Approve for owner action", rejected: "Reject recommendation", actioned: "Record owner action completed", verified: "Verify savings", open: "Reopen" };
    const dlg = document.createElement("dialog");
    dlg.innerHTML = `<form method="dialog"><div class="dlg-body">
      <h3 style="font-size:17px">${labels[next]}</h3><p class="small muted">${esc(r.title)}</p>
      ${next === "approved" ? `<div class="callout callout-guard" style="margin-bottom:12px">${ICON.shield}<div>Approval records a decision. <strong>SeatSignal will not change any account or subscription.</strong> The ${esc(A.subById[r.subscriptionId].owner)} owner makes the change with the vendor.</div></div>` : ""}
      ${next === "verified" ? `<div class="field"><label for="dlg-amt">Verified annual saving (USD)</label><input class="input num" id="dlg-amt" type="number" min="0" step="1" required value="${r.estimate ? Math.round(r.estimate.low) : 0}"><span class="hint">Enter the amount confirmed on the vendor document, not the estimate.</span></div>
        <div class="field"><label for="dlg-ref">Verification evidence</label><input class="input" id="dlg-ref" required placeholder="e.g. amended order form #, credit memo #, renewal invoice #"></div>` : ""}
      <div class="field"><label for="dlg-note">Note ${next === "rejected" ? "(required)" : "(optional)"}</label><textarea class="input" id="dlg-note" rows="3" ${next === "rejected" ? "required" : ""}></textarea></div>
      <p class="error-text" id="dlg-err" hidden>Please complete the required fields.</p>
    </div><div class="dlg-foot"><button class="btn btn-ghost btn-sm" value="cancel" formnovalidate>Cancel</button><button class="btn btn-primary btn-sm" value="ok" id="dlg-ok">${labels[next]}</button></div></form>`;
    document.body.appendChild(dlg);
    dlg.addEventListener("close", () => dlg.remove());
    $("#dlg-ok", dlg).addEventListener("click", (e) => {
      e.preventDefault();
      const note = $("#dlg-note", dlg).value.trim();
      const amt = $("#dlg-amt", dlg), ref = $("#dlg-ref", dlg);
      if ((next === "rejected" && !note) || (next === "verified" && (!ref.value.trim() || amt.value === "" || Number(amt.value) < 0))) { $("#dlg-err", dlg).hidden = false; return; }
      const w = workflow[recId] || { status: "open", history: [] };
      w.status = next;
      if (next === "verified") { w.verifiedAmount = Number(amt.value); w.verificationRef = ref.value.trim(); }
      w.history = (w.history || []).concat([{ at: new Date().toISOString(), by: "You (demo user)", action: { in_review: "Started review", approved: "Approved for owner action", rejected: "Rejected", actioned: "Owner reported action completed", verified: "Savings verified", open: "Reopened" }[next], note: next === "verified" ? `${usd(w.verifiedAmount)}/yr — ${w.verificationRef}${note ? ". " + note : ""}` : note }]);
      workflow[recId] = w;
      saveWorkflow();
      dlg.close();
      dlg.remove();
      toast(`${STATUS_LABEL[next]} — recorded in the audit log.`);
      render();
    });
    dlg.showModal();
  }

  // ---------- import handling ----------
  function setPreview(p) { pendingPreview = p; $("#imp-preview").innerHTML = p ? previewHtml(p) : ""; }
  function readForm() { return { subscriptionId: $("#imp-sub").value, periodStart: $("#imp-start").value, periodEnd: $("#imp-end").value, source: $("#imp-source").value.trim() || "Manual upload (CSV)" }; }
  function handleFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { const parsed = E.parseUsageCsv(reader.result); setPreview(Object.assign(readForm(), { filename: file.name, rows: parsed.rows, errors: parsed.errors })); };
    reader.readAsText(file);
  }
  function confirmImport() {
    const p = Object.assign({}, pendingPreview, readForm());
    if (!p.periodStart || !p.periodEnd || p.periodEnd < p.periodStart) { toast("Check the report period dates."); return; }
    userImports.push({ id: "imp-user-" + Date.now(), subscriptionId: p.subscriptionId, source: p.source, filename: p.filename, importedAt: new Date().toISOString(), importedBy: "You (demo user)", periodStart: p.periodStart, periodEnd: p.periodEnd, rows: p.rows, userImported: true });
    store.set(IMP_KEY, userImports);
    pendingPreview = null;
    A = E.analyze(dataset());
    toast(`Imported ${p.rows.length} rows. Recommendations recalculated.`);
    location.hash = "#/subscriptions/" + p.subscriptionId;
  }

  // ---------- render & events ----------
  function render() {
    A = E.analyze(dataset());
    const parts = (location.hash.replace(/^#\/?/, "") || "overview").split("/");
    const name = views[parts[0]] ? parts[0] : "overview";
    renderNav(name);
    const v = $("#view");
    v.innerHTML = views[name](parts.slice(1).join("/") || undefined);
    document.title = `${$("h1", v) ? $("h1", v).textContent : "Workspace"} · SeatSignal`;
  }

  window.addEventListener("hashchange", () => { render(); $("#view").focus({ preventScroll: true }); window.scrollTo(0, 0); });

  document.addEventListener("click", (e) => {
    const row = e.target.closest("tr[data-href]");
    if (row && !e.target.closest("a,button")) { location.hash = row.dataset.href; return; }
    const wf = e.target.closest("[data-wf]");
    if (wf) { openWorkflowDialog(wf.dataset.rec, wf.dataset.wf); return; }
    const rt = e.target.closest("[data-rtype]");
    if (rt) { recFilter = rt.dataset.rtype; render(); return; }
    const ls = e.target.closest("[data-status]");
    if (ls) { licFilter.status = ls.dataset.status; render(); return; }
    if (e.target.id === "imp-sample") {
      const p = BASE.pendingImport;
      $("#imp-sub").value = p.subscriptionId; $("#imp-start").value = p.periodStart; $("#imp-end").value = p.periodEnd; $("#imp-source").value = p.source;
      setPreview(Object.assign(readForm(), { filename: p.filename, rows: p.rows, errors: [] }));
      return;
    }
    if (e.target.id === "imp-confirm") { confirmImport(); return; }
    if (e.target.id === "imp-cancel") { setPreview(null); return; }
    if (e.target.id === "print-report") { window.print(); return; }
    if (e.target.id === "reset-demo") {
      if (!confirm("Reset the demo? This clears your demo decisions and imported reports in this browser.")) return;
      store.del(WF_KEY); store.del(IMP_KEY); workflow = SEED_WORKFLOW(); userImports = []; pendingPreview = null; render(); toast("Demo reset.");
    }
  });
  document.addEventListener("input", (e) => {
    if (e.target.id === "lf-q") { licFilter.q = e.target.value; const pos = e.target.selectionStart; render(); const q = $("#lf-q"); q.focus(); q.setSelectionRange(pos, pos); }
  });
  document.addEventListener("change", (e) => {
    if (e.target.id === "lf-dept") { licFilter.dept = e.target.value; render(); }
    if (e.target.id === "imp-file") handleFile(e.target.files[0]);
  });
  document.addEventListener("dragover", (e) => { const dz = e.target.closest && e.target.closest("#dropzone"); if (dz) { e.preventDefault(); dz.classList.add("drag"); } });
  document.addEventListener("dragleave", (e) => { const dz = e.target.closest && e.target.closest("#dropzone"); if (dz) dz.classList.remove("drag"); });
  document.addEventListener("drop", (e) => { const dz = e.target.closest && e.target.closest("#dropzone"); if (dz) { e.preventDefault(); dz.classList.remove("drag"); handleFile(e.dataTransfer.files[0]); } });

  // tooltip
  const tip = $("#tooltip");
  document.addEventListener("mouseover", (e) => { const el = e.target.closest("[data-tip]"); if (!el) { tip.hidden = true; return; } tip.textContent = el.dataset.tip; tip.hidden = false; });
  document.addEventListener("mousemove", (e) => { if (tip.hidden) return; const x = Math.min(e.clientX + 14, window.innerWidth - tip.offsetWidth - 8); tip.style.left = x + "px"; tip.style.top = e.clientY + 16 + "px"; });

  let toastTimer;
  function toast(msg) { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), 3200); }

  $("#asof").textContent = date(BASE.meta.asOf);
  render();
})();
