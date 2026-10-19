// S3 ObjectCreated trigger on s3://<bucket>/<org-id>/usage/<subscription-slug>/<period-start>_<period-end>/<file>.csv
// Parses a vendor activity export a person uploaded. This is the only path (besides an
// authorized read-only integration) by which SeatSignal learns anything about usage.
import { S3Client, GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { tx } from "../../shared/db.mjs";

const require = createRequire(import.meta.url);
const Engine = require("../../shared/engine.cjs");
const s3 = new S3Client({});

export async function handler(event) {
  const out = [];
  for (const rec of event.Records || []) {
    const bucket = rec.s3.bucket.name;
    const key = decodeURIComponent(rec.s3.object.key.replace(/\+/g, " "));
    const m = key.match(/^([0-9a-f-]{36})\/usage\/([a-z0-9-]+)\/(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})\/[^/]+\.csv$/i);
    if (!m) { console.warn("ignoring key", key); continue; }
    const [, orgId, slug, periodStart, periodEnd] = m;

    // Uploader and source label are set as object metadata by the upload API.
    const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    const uploadedBy = head.Metadata?.["uploaded-by"] || null;
    const sourceLabel = head.Metadata?.["source-label"] || "Manual upload (CSV)";

    const body = await (await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }))).Body.transformToString("utf-8");
    const { rows, errors } = Engine.parseUsageCsv(body);
    if (errors.length && rows.length === 0) {
      out.push({ key, status: "rejected", errors: errors.slice(0, 10) });
      continue;
    }

    const result = await tx(async (db) => {
      const sub = (await db.query("SELECT id FROM subscriptions WHERE org_id = $1 AND slug = $2", [orgId, slug])).rows[0];
      if (!sub) throw new Error(`unknown subscription ${slug}`);
      const file = (await db.query(
        `INSERT INTO source_files (org_id, kind, s3_bucket, s3_key, sha256, uploaded_by) VALUES ($1,'usage_report',$2,$3,$4,$5)
         ON CONFLICT (s3_bucket, s3_key) DO UPDATE SET sha256 = EXCLUDED.sha256 RETURNING id`,
        [orgId, bucket, key, createHash("sha256").update(body).digest("hex"), uploadedBy])).rows[0];
      const emp = Object.fromEntries((await db.query("SELECT lower(email) AS email, id FROM employees WHERE org_id = $1", [orgId])).rows.map((r) => [r.email, r.id]));
      const unmatched = rows.filter((r) => !emp[r.email]).length;
      const imp = (await db.query(
        `INSERT INTO usage_imports (subscription_id, source_file_id, source_label, period_start, period_end, imported_by, row_count, unmatched_count)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [sub.id, file.id, sourceLabel, periodStart, periodEnd, uploadedBy, rows.length, unmatched])).rows[0];
      for (const r of rows) {
        await db.query(
          `INSERT INTO usage_records (import_id, email, employee_id, last_active_date, active_days_in_period) VALUES ($1,$2,$3,$4,$5)
           ON CONFLICT (import_id, email) DO NOTHING`,
          [imp.id, r.email, emp[r.email] || null, r.last_active_date || null, r.active_days_in_period]);
      }
      return { importId: imp.id, rows: rows.length, unmatched, rowErrors: errors.length };
    });
    out.push({ key, status: "imported", ...result });
  }
  console.log(JSON.stringify(out));
  return out;
}
