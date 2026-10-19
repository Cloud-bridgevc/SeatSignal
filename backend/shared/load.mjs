// Loads one organization's records from PostgreSQL into the shape the analysis engine expects
// (the same shape as web/data/sample-data.js).
export async function loadOrgDataset(db, orgId, asOf) {
  const q = async (sql, params = [orgId]) => (await db.query(sql, params)).rows;
  const [org] = await q("SELECT name, is_sample FROM organizations WHERE id = $1");

  const employees = (await q("SELECT external_id AS id, full_name AS name, lower(email) AS email, department, status, to_char(terminated_on,'YYYY-MM-DD') AS \"terminatedOn\" FROM employees WHERE org_id = $1"));

  const subsRows = await q(`
    SELECT s.id AS uuid, s.slug AS id, s.name, v.name AS vendor, s.category, s.seats, s.per_seat_monthly::float AS "perSeatMonthly",
           s.flat_annual::float AS "flatAnnual", s.annual_cost::float AS "annualCost", s.currency, to_char(s.renewal_date,'YYYY-MM-DD') AS renewal,
           s.term_months AS "termMonths", s.auto_renew AS "autoRenew", s.notice_days AS "noticeDays", s.owner_team AS owner
    FROM subscriptions s JOIN vendors v ON v.id = s.vendor_id WHERE s.org_id = $1 AND s.status = 'active'`);
  const slugByUuid = Object.fromEntries(subsRows.map((s) => [s.uuid, s.id]));

  const contracts = {};
  for (const c of await q(`
      SELECT c.id, c.subscription_id, f.s3_key, c.extracted_at, c.reviewed_at, u.display_name AS reviewer
      FROM contracts c JOIN subscriptions s ON s.id = c.subscription_id JOIN source_files f ON f.id = c.source_file_id
      LEFT JOIN app_users u ON u.id = c.reviewed_by
      WHERE s.org_id = $1 AND c.extraction_status = 'extracted'`)) {
    const fields = {};
    for (const f of await q("SELECT field_name, coalesce(corrected_value, value) AS value, confidence, page, snippet FROM contract_fields WHERE contract_id = $1", [c.id])) {
      fields[f.field_name] = { value: f.value, confidence: f.confidence, page: f.page, snippet: f.snippet };
    }
    contracts[slugByUuid[c.subscription_id]] = {
      document: c.s3_key.split("/").pop(), storedAt: c.s3_key, extractedAt: c.extracted_at?.toISOString(), reviewedBy: c.reviewer, fields,
    };
  }

  const assignments = {};
  for (const a of await q(`SELECT la.subscription_id, e.external_id FROM license_assignments la JOIN employees e ON e.id = la.employee_id WHERE e.org_id = $1`)) {
    (assignments[slugByUuid[a.subscription_id]] ||= []).push(a.external_id);
  }

  const imports = [];
  for (const i of await q(`
      SELECT ui.id, ui.subscription_id, ui.source_label, coalesce(f.s3_key, ui.integration_id) AS filename, ui.imported_at,
             coalesce(u.display_name, 'integration') AS imported_by, to_char(ui.period_start,'YYYY-MM-DD') AS ps, to_char(ui.period_end,'YYYY-MM-DD') AS pe
      FROM usage_imports ui JOIN subscriptions s ON s.id = ui.subscription_id
      LEFT JOIN source_files f ON f.id = ui.source_file_id LEFT JOIN app_users u ON u.id = ui.imported_by
      WHERE s.org_id = $1`)) {
    const rows = await q("SELECT lower(email) AS email, coalesce(to_char(last_active_date,'YYYY-MM-DD'),'') AS last_active_date, active_days_in_period FROM usage_records WHERE import_id = $1", [i.id]);
    imports.push({ id: i.id, subscriptionId: slugByUuid[i.subscription_id], source: i.source_label, filename: i.filename.split("/").pop(), importedAt: i.imported_at.toISOString(), importedBy: i.imported_by, periodStart: i.ps, periodEnd: i.pe, rows });
  }

  const invoices = (await q(`SELECT i.subscription_id, i.period_label AS quarter, i.seats, i.amount::float AS amount, i.invoice_ref AS "invoiceRef" FROM invoices i JOIN subscriptions s ON s.id = i.subscription_id WHERE s.org_id = $1`))
    .map((r) => ({ ...r, subscriptionId: slugByUuid[r.subscription_id] }));
  const hc = await q("SELECT period_label, headcount FROM headcount_snapshots WHERE org_id = $1 ORDER BY period_label");

  return {
    meta: {
      isSampleData: org.is_sample, company: org.name, asOf,
      sources: { hris: { file: "HRIS roster" }, idp: { file: "Identity-provider assignments" }, ap: { file: "AP invoice export" } },
    },
    employees,
    subscriptions: subsRows.map(({ uuid, ...s }) => s),
    subscriptionUuidBySlug: Object.fromEntries(subsRows.map((s) => [s.id, s.uuid])),
    contracts,
    assignments,
    imports,
    invoices,
    quarters: hc.map((h) => h.period_label),
    headcountByQuarter: Object.fromEntries(hc.map((h) => [h.period_label, h.headcount])),
  };
}
