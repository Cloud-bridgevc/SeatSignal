// Generates the FICTIONAL demo dataset used by the SeatSignal web demo.
// Output: web/data/sample-data.js and web/sample-data/*.csv
// Everything here is invented: company, people, vendors, contracts, prices and usage.
// Run: node scripts/generate-sample-data.mjs

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const AS_OF = "2026-10-18";
const DOMAIN = "halcyon.example";

// Deterministic PRNG so the dataset is identical on every run.
let seed = 20261018;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};

const FIRST = ["Ava", "Ben", "Chloe", "Dev", "Elena", "Femi", "Grace", "Hiro", "Imani", "Jonas", "Kira", "Luca", "Maya", "Nikhil", "Olu", "Priya", "Quinn", "Rosa", "Sami", "Tara", "Uma", "Victor", "Wren", "Xavi", "Yara", "Zane", "Adaeze", "Bruno", "Cleo", "Dara"];
const LAST = ["Okafor", "Lindqvist", "Moreau", "Patel", "Nakamura", "Adeyemi", "Fischer", "Costa", "Byrne", "Haddad", "Ivanova", "Kowalski", "Mensah", "Novak", "Ortiz", "Quist", "Reyes", "Sato"];

const DEPTS = [
  ["Engineering", 40], ["Product", 10], ["Design", 8], ["Sales", 22], ["Marketing", 12],
  ["Finance", 8], ["People", 5], ["IT", 6], ["Customer Success", 9],
];

// ---------- Employees (HRIS roster export) ----------
const employees = [];
let n = 0;
for (const [dept, count] of DEPTS) {
  for (let i = 0; i < count; i++) {
    const first = FIRST[n % FIRST.length];
    const last = LAST[(n * 7 + 3) % LAST.length];
    const id = `E${String(1001 + n).padStart(4, "0")}`;
    employees.push({
      id,
      name: `${first} ${last}`,
      email: `${first}.${last}${n}`.toLowerCase() + `@${DOMAIN}`,
      department: dept,
      status: "active",
      terminatedOn: null,
    });
    n++;
  }
}
// Departed employees (status from HRIS, not from usage data).
const departures = [
  ["E1003", "2026-06-12"], ["E1017", "2026-08-01"], ["E1052", "2026-07-20"], ["E1054", "2026-05-30"],
  ["E1063", "2026-09-05"], ["E1067", "2026-08-22"], ["E1072", "2026-04-15"], ["E1098", "2026-09-26"],
];
for (const [id, date] of departures) {
  const e = employees.find((x) => x.id === id);
  e.status = "terminated";
  e.terminatedOn = date;
}
const byDept = (...d) => employees.filter((e) => d.includes(e.department));
const active = employees.filter((e) => e.status === "active");

// ---------- Subscriptions & contracts ----------
// perSeatMonthly null => flat platform fee.
const subscriptions = [
  { id: "taskt", name: "TaskTrack", vendor: "TaskTrack Software Ltd (fictional)", category: "Project management", seats: 140, perSeatMonthly: 16, renewal: "2027-03-01", termMonths: 12, autoRenew: true, noticeDays: 60, owner: "IT", contractDoc: "TaskTrack_OrderForm_2026.pdf" },
  { id: "flowb", name: "FlowBoard", vendor: "FlowBoard Inc. (fictional)", category: "Project management", seats: 60, perSeatMonthly: 22, renewal: "2026-11-28", termMonths: 12, autoRenew: true, noticeDays: 30, owner: "Marketing", contractDoc: "FlowBoard_Subscription_Agreement_2025.pdf", featured: true },
  { id: "pixel", name: "PixelBoard", vendor: "PixelBoard Labs (fictional)", category: "Design", seats: 25, perSeatMonthly: 45, renewal: "2027-02-14", termMonths: 12, autoRenew: true, noticeDays: 30, owner: "Design", contractDoc: "PixelBoard_Order_2026.pdf" },
  { id: "meet", name: "MeetSpace", vendor: "MeetSpace Communications (fictional)", category: "Video conferencing", seats: 130, perSeatMonthly: 12, renewal: "2027-01-15", termMonths: 12, autoRenew: true, noticeDays: 45, owner: "IT", contractDoc: "MeetSpace_MSA_and_Order.pdf" },
  { id: "vidl", name: "VidLink", vendor: "VidLink Video GmbH (fictional)", category: "Video conferencing", seats: 30, perSeatMonthly: 15, renewal: "2026-12-10", termMonths: 12, autoRenew: true, noticeDays: null, owner: "Sales", contractDoc: "VidLink_Quote_Signed.pdf" },
  { id: "codev", name: "CodeVault", vendor: "CodeVault Systems (fictional)", category: "Source control", seats: 45, perSeatMonthly: 21, renewal: "2027-06-30", termMonths: 12, autoRenew: false, noticeDays: 30, owner: "Engineering", contractDoc: "CodeVault_Enterprise_Order.pdf" },
  { id: "signf", name: "SignFlow", vendor: "SignFlow Ltd (fictional)", category: "E-signature", seats: 15, perSeatMonthly: 30, renewal: "2026-12-31", termMonths: 12, autoRenew: true, noticeDays: null, owner: "Finance", contractDoc: null },
  { id: "ledg", name: "Ledgerly", vendor: "Ledgerly Finance Apps (fictional)", category: "Expense management", seats: null, perSeatMonthly: null, flatAnnual: 9600, renewal: "2027-02-01", termMonths: 24, autoRenew: false, noticeDays: 60, owner: "Finance", contractDoc: "Ledgerly_Platform_Agreement.pdf" },
  { id: "datal", name: "DataLens", vendor: "DataLens Analytics (fictional)", category: "Business intelligence", seats: 20, perSeatMonthly: 70, renewal: "2027-04-15", termMonths: 12, autoRenew: true, noticeDays: 60, owner: "Finance", contractDoc: "DataLens_Renewal_Quote_2026.pdf" },
  { id: "keyl", name: "KeyLocker", vendor: "KeyLocker Security (fictional)", category: "Password management", seats: 120, perSeatMonthly: 4, renewal: "2027-05-01", termMonths: 12, autoRenew: true, noticeDays: 30, owner: "IT", contractDoc: "KeyLocker_Order_2026.pdf" },
  { id: "helph", name: "HelpHub", vendor: "HelpHub Support Co. (fictional)", category: "Customer support", seats: 12, perSeatMonthly: 59, renewal: "2026-12-20", termMonths: 12, autoRenew: true, noticeDays: 30, owner: "Customer Success", contractDoc: "HelpHub_Order_Form.pdf" },
  { id: "chatb", name: "Chatterbox", vendor: "Chatterbox Messaging (fictional)", category: "Team messaging", seats: 125, perSeatMonthly: 8.75, renewal: "2027-08-01", termMonths: 12, autoRenew: true, noticeDays: 30, owner: "IT", contractDoc: "Chatterbox_Business_Order.pdf" },
  { id: "notely", name: "Notely", vendor: "Notely Docs (fictional)", category: "Knowledge base", seats: 120, perSeatMonthly: 10, renewal: "2026-12-05", termMonths: 12, autoRenew: true, noticeDays: 30, owner: "IT", contractDoc: "Notely_Team_Order.pdf" },
  { id: "surv", name: "SurveyNest", vendor: "SurveyNest (fictional)", category: "Surveys", seats: 5, perSeatMonthly: 25, renewal: "2026-11-10", termMonths: 12, autoRenew: true, noticeDays: 30, owner: "People", contractDoc: "SurveyNest_Checkout_Receipt.pdf" },
];
for (const s of subscriptions) {
  s.annualCost = s.flatAnnual ?? Math.round(s.seats * s.perSeatMonthly * 12);
  s.currency = "USD";
}

// ---------- Extracted contract fields (what Bedrock extraction returns) ----------
// Each field: value, confidence, source (page + quoted snippet from the fictional document).
const field = (value, confidence, page, snippet) => ({ value, confidence, page, snippet });
const contracts = {};
for (const s of subscriptions) {
  if (!s.contractDoc) continue;
  const seatText = s.seats ? `${s.seats} named user licenses` : "Platform subscription (unlimited users)";
  contracts[s.id] = {
    document: s.contractDoc,
    storedAt: `s3://seatsignal-demo-contracts/halcyon/${s.contractDoc}`,
    extractedAt: "2026-10-02T09:14:00Z",
    reviewedBy: s.id === "flowb" ? "J. Byrne (Procurement)" : null,
    fields: {
      subscriptionName: field(s.name, "high", 1, `Service: ${s.name}`),
      seats: field(s.seats, s.seats ? "high" : "medium", 1, seatText),
      annualCost: field(s.annualCost, "high", 2, `Annual fees: USD ${s.annualCost.toLocaleString("en-US")}`),
      termMonths: field(s.termMonths, "high", 1, `Initial term: ${s.termMonths} months`),
      renewalDate: field(s.renewal, "high", 1, `Renewal date: ${s.renewal}`),
      autoRenew: field(s.autoRenew, s.autoRenew ? "high" : "medium", 3, s.autoRenew ? "renews automatically for successive periods equal to the initial term" : "This order does not renew automatically"),
      noticeDays: s.noticeDays == null
        ? field(null, "none", null, "No notice period found in the document")
        : field(s.noticeDays, "high", 3, `written notice at least ${s.noticeDays} days prior to the end of the then-current term`),
      priceIncreaseCap: s.id === "datal"
        ? field(null, "none", null, "No price-increase cap found in the document")
        : field(s.id === "flowb" ? "5%" : "7%", "medium", 4, `fees may increase by no more than ${s.id === "flowb" ? "5%" : "7%"} at renewal`),
    },
  };
}
// FlowBoard contract excerpt shown in the walkthrough.
contracts.flowb.excerpt = [
  "ORDER FORM — FlowBoard Business Plan (FICTIONAL SAMPLE DOCUMENT)",
  "Customer: Halcyon Freight Co. (fictional)",
  "Service: FlowBoard — 60 named user licenses",
  "Initial term: 12 months, commencing 2025-11-28. Renewal date: 2026-11-28",
  "Annual fees: USD 15,840 (USD 22 per user per month)",
  "§3.2 This Order renews automatically for successive periods equal to the initial term unless either party gives written notice at least 30 days prior to the end of the then-current term.",
  "§3.4 Customer may reduce the number of licenses effective at renewal by providing written notice within the notice period.",
  "§4.1 Fees may increase by no more than 5% at renewal.",
];

// ---------- Employee-to-license mapping (from IdP/SSO group export) ----------
const pick = (list, k) => list.slice(0, k).map((e) => e.id);
const assignments = {
  taskt: active.map((e) => e.id).slice(0, 112),
  flowb: [...byDept("Marketing", "Design", "Product", "Customer Success").map((e) => e.id), ...pick(byDept("Sales"), 13)],
  pixel: [...byDept("Design").map((e) => e.id), ...pick(byDept("Product"), 7), ...pick(byDept("Marketing"), 5)],
  meet: [...active.map((e) => e.id).slice(0, 112), ...employees.filter((e) => e.status === "terminated").map((e) => e.id).slice(0, 3)],
  vidl: pick(byDept("Sales"), 22),
  codev: [...byDept("Engineering").map((e) => e.id), ...pick(byDept("IT"), 3)],
  signf: [...byDept("Finance").map((e) => e.id), ...pick(byDept("Sales"), 4)],
  ledg: active.map((e) => e.id),
  datal: [...byDept("Finance").map((e) => e.id), ...pick(byDept("Product"), 6), ...pick(byDept("Marketing"), 6)],
  keyl: active.map((e) => e.id).slice(0, 110),
  helph: byDept("Customer Success").map((e) => e.id),
  chatb: active.map((e) => e.id),
  notely: active.map((e) => e.id).slice(0, 108),
  surv: byDept("People").map((e) => e.id),
};
// Trim FlowBoard to 52 assignees.
assignments.flowb = assignments.flowb.slice(0, 52);

// ---------- Imported usage reports ----------
// Each import is a vendor admin-console export uploaded by a person. Rows: email,last_active_date,active_days_in_period
const addDays = (iso, d) => { const t = new Date(iso + "T00:00:00Z"); t.setUTCDate(t.getUTCDate() + d); return t.toISOString().slice(0, 10); };
const empById = Object.fromEntries(employees.map((e) => [e.id, e]));

function buildRows(subId, { periodStart, periodEnd, activeShare, forceInactive = [], extraUnknownEmails = [] }) {
  const rows = [];
  for (const id of assignments[subId]) {
    const e = empById[id];
    let lastActive = null;
    let days = 0;
    const terminated = e.status === "terminated";
    if (!terminated && !forceInactive.includes(id) && rand() < activeShare) {
      lastActive = addDays(periodEnd, -Math.floor(rand() * 20));
      days = 5 + Math.floor(rand() * 50);
    } else if (!terminated && rand() < 0.5) {
      // Had activity, but long before the period: last login predates window.
      lastActive = addDays(periodStart, -(20 + Math.floor(rand() * 200)));
    } else if (terminated && e.terminatedOn) {
      lastActive = addDays(e.terminatedOn, -3);
    }
    rows.push({ email: e.email, last_active_date: lastActive ?? "", active_days_in_period: days });
  }
  for (const email of extraUnknownEmails) rows.push({ email, last_active_date: addDays(periodEnd, -4), active_days_in_period: 12 });
  return rows;
}

// FlowBoard: target exactly 14 active of 52 assigned.
const flowActiveIds = new Set(
  assignments.flowb.filter((id) => empById[id].status === "active").filter((id) => ["Design", "Marketing"].includes(empById[id].department)).slice(0, 14)
);
const flowRows = assignments.flowb.map((id) => {
  const e = empById[id];
  if (flowActiveIds.has(id)) return { email: e.email, last_active_date: addDays("2026-09-30", -Math.floor(rand() * 18)), active_days_in_period: 8 + Math.floor(rand() * 40) };
  if (e.status === "terminated") return { email: e.email, last_active_date: addDays(e.terminatedOn, -5), active_days_in_period: 0 };
  return { email: e.email, last_active_date: rand() < 0.6 ? addDays("2026-07-01", -(30 + Math.floor(rand() * 150))) : "", active_days_in_period: 0 };
});

const imports = [
  { id: "imp-flowb-q3", subscriptionId: "flowb", source: "FlowBoard admin console → Members export (CSV)", filename: "flowboard_members_2026Q3.csv", importedAt: "2026-10-09T15:02:00Z", importedBy: "M. Okafor (IT)", periodStart: "2026-07-01", periodEnd: "2026-09-30", rows: flowRows },
  { id: "imp-pixel-q3", subscriptionId: "pixel", source: "PixelBoard admin → Seat activity report (CSV)", filename: "pixelboard_seat_activity_q3.csv", importedAt: "2026-10-08T10:40:00Z", importedBy: "M. Okafor (IT)", periodStart: "2026-07-01", periodEnd: "2026-09-30", rows: buildRows("pixel", { periodStart: "2026-07-01", periodEnd: "2026-09-30", activeShare: 0.9 }) },
  { id: "imp-meet-q3", subscriptionId: "meet", source: "MeetSpace admin → User activity (CSV)", filename: "meetspace_user_activity_q3.csv", importedAt: "2026-10-08T10:52:00Z", importedBy: "M. Okafor (IT)", periodStart: "2026-07-01", periodEnd: "2026-09-30", rows: buildRows("meet", { periodStart: "2026-07-01", periodEnd: "2026-09-30", activeShare: 0.93 }) },
  { id: "imp-codev-q3", subscriptionId: "codev", source: "CodeVault org audit → Member activity (CSV)", filename: "codevault_member_activity_q3.csv", importedAt: "2026-10-07T08:30:00Z", importedBy: "Engineering Ops", periodStart: "2026-07-01", periodEnd: "2026-09-30", rows: buildRows("codev", { periodStart: "2026-07-01", periodEnd: "2026-09-30", activeShare: 0.95, extraUnknownEmails: ["contractor.build@partner-agency.example"] }) },
  { id: "imp-datal-sep", subscriptionId: "datal", source: "DataLens admin → Viewer activity, last 30 days (CSV)", filename: "datalens_activity_sep.csv", importedAt: "2026-10-03T12:10:00Z", importedBy: "Finance Systems", periodStart: "2026-09-01", periodEnd: "2026-09-30", rows: buildRows("datal", { periodStart: "2026-09-01", periodEnd: "2026-09-30", activeShare: 0.45 }) },
  { id: "imp-keyl-q3", subscriptionId: "keyl", source: "KeyLocker admin → Member report (CSV)", filename: "keylocker_members_q3.csv", importedAt: "2026-10-06T09:00:00Z", importedBy: "M. Okafor (IT)", periodStart: "2026-07-01", periodEnd: "2026-09-30", rows: buildRows("keyl", { periodStart: "2026-07-01", periodEnd: "2026-09-30", activeShare: 0.94 }) },
  { id: "imp-chatb-q3", subscriptionId: "chatb", source: "Chatterbox admin → Member analytics (CSV)", filename: "chatterbox_member_analytics_q3.csv", importedAt: "2026-10-06T09:20:00Z", importedBy: "M. Okafor (IT)", periodStart: "2026-07-01", periodEnd: "2026-09-30", rows: buildRows("chatb", { periodStart: "2026-07-01", periodEnd: "2026-09-30", activeShare: 0.97 }) },
  { id: "imp-notely-q3", subscriptionId: "notely", source: "Notely admin → Workspace members (CSV)", filename: "notely_members_q3.csv", importedAt: "2026-10-06T09:35:00Z", importedBy: "M. Okafor (IT)", periodStart: "2026-07-01", periodEnd: "2026-09-30", rows: buildRows("notely", { periodStart: "2026-07-01", periodEnd: "2026-09-30", activeShare: 0.82 }) },
];

// A report that exists but has NOT been imported — used to demonstrate the import flow.
const pendingImport = {
  subscriptionId: "taskt",
  source: "TaskTrack admin → License activity (CSV)",
  filename: "tasktrack_license_activity_q3.csv",
  periodStart: "2026-07-01",
  periodEnd: "2026-09-30",
  rows: buildRows("taskt", { periodStart: "2026-07-01", periodEnd: "2026-09-30", activeShare: 0.88 }),
};

// ---------- Invoice history (quarterly, from AP system) ----------
const quarters = ["2025-Q2", "2025-Q3", "2025-Q4", "2026-Q1", "2026-Q2", "2026-Q3"];
const invoices = [];
for (const s of subscriptions) {
  quarters.forEach((q, qi) => {
    let seats = s.seats;
    let perSeat = s.perSeatMonthly;
    let flat = s.flatAnnual;
    if (s.id === "flowb" && qi < 3) seats = 40; // expanded 40 → 60 in 2026-Q1 (mid-term true-up)
    if (s.id === "meet" && qi < 5) seats = 100; // jumped 100 → 130 in 2026-Q3
    if (s.id === "datal" && qi < 5) perSeat = 50.7; // per-seat price rose ~38% in 2026-Q3
    if (s.id === "notely" && qi < 2) seats = 110;
    const amount = flat ? Math.round(flat / 4) : Math.round(seats * perSeat * 3);
    invoices.push({ subscriptionId: s.id, quarter: q, seats: seats ?? null, amount, invoiceRef: `INV-${s.id.toUpperCase()}-${q.replace("-", "")}` });
  });
}
const headcountByQuarter = { "2025-Q2": 106, "2025-Q3": 108, "2025-Q4": 110, "2026-Q1": 112, "2026-Q2": 114, "2026-Q3": 112 };

const data = {
  meta: {
    isSampleData: true,
    company: "Halcyon Freight Co. (fictional)",
    asOf: AS_OF,
    note: "All companies, people, vendors, contracts, prices, invoices and usage records in this dataset are fictional and generated for demonstration.",
    sources: {
      hris: { name: "HRIS roster export (sample)", file: "halcyon_hris_roster_2026-10-15.csv", importedAt: "2026-10-15T07:00:00Z" },
      idp: { name: "Identity provider app-assignment export (sample)", file: "idp_app_assignments_2026-10-15.csv", importedAt: "2026-10-15T07:05:00Z" },
      ap: { name: "Accounts payable invoice export (sample)", file: "ap_saas_invoices_FY25-26.csv", importedAt: "2026-10-12T16:00:00Z" },
    },
  },
  employees,
  subscriptions,
  contracts,
  assignments,
  imports,
  pendingImport,
  invoices,
  quarters,
  headcountByQuarter,
};

const outJs = join(root, "web/data/sample-data.js");
mkdirSync(dirname(outJs), { recursive: true });
writeFileSync(outJs, `// AUTO-GENERATED by scripts/generate-sample-data.mjs — FICTIONAL SAMPLE DATA. Do not edit by hand.\nwindow.SEATSIGNAL_SAMPLE = ${JSON.stringify(data, null, 1)};\n`);

const csvDir = join(root, "web/sample-data");
mkdirSync(csvDir, { recursive: true });
const toCsv = (rows) => ["email,last_active_date,active_days_in_period", ...rows.map((r) => `${r.email},${r.last_active_date},${r.active_days_in_period}`)].join("\n") + "\n";
for (const imp of imports) writeFileSync(join(csvDir, imp.filename), toCsv(imp.rows));
writeFileSync(join(csvDir, pendingImport.filename), toCsv(pendingImport.rows));
writeFileSync(join(csvDir, "halcyon_hris_roster_2026-10-15.csv"),
  ["employee_id,name,email,department,status,terminated_on", ...employees.map((e) => `${e.id},${e.name},${e.email},${e.department},${e.status},${e.terminatedOn ?? ""}`)].join("\n") + "\n");

console.log(`employees=${employees.length} subscriptions=${subscriptions.length} imports=${imports.length} flowboardActive=${flowActiveIds.size}/${assignments.flowb.length}`);
