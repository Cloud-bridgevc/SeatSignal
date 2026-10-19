// S3 ObjectCreated trigger on s3://<bucket>/<org-id>/contracts/<subscription-slug>/<file>.pdf
// Extracts contract terms with Amazon Bedrock and stores them for HUMAN REVIEW.
// Extracted values do not overwrite subscription terms until a reviewer confirms them.
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { createHash } from "node:crypto";
import { tx } from "../../shared/db.mjs";
import { extractContractFields } from "../../shared/bedrock.mjs";

const s3 = new S3Client({});
const MAX_PDF_BYTES = 30 * 1024 * 1024; // request limit is 32 MB including overhead

export async function handler(event) {
  const results = [];
  for (const rec of event.Records || []) {
    const bucket = rec.s3.bucket.name;
    const key = decodeURIComponent(rec.s3.object.key.replace(/\+/g, " "));
    const m = key.match(/^([0-9a-f-]{36})\/contracts\/([a-z0-9-]+)\/[^/]+\.pdf$/i);
    if (!m) { console.warn("ignoring key", key); continue; }
    const [, orgId, slug] = m;

    const obj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const pdf = Buffer.from(await obj.Body.transformToByteArray());
    const sha256 = createHash("sha256").update(pdf).digest("hex");

    const result = pdf.length > MAX_PDF_BYTES
      ? { status: "needs_manual_review", reason: "file too large for automated extraction" }
      : await extractContractFields(pdf, { filename: key.split("/").pop() });

    await tx(async (db) => {
      const sub = (await db.query("SELECT id FROM subscriptions WHERE org_id = $1 AND slug = $2", [orgId, slug])).rows[0];
      if (!sub) throw new Error(`unknown subscription ${slug} for org ${orgId}`);
      const file = (await db.query(
        `INSERT INTO source_files (org_id, kind, s3_bucket, s3_key, sha256) VALUES ($1,'contract',$2,$3,$4)
         ON CONFLICT (s3_bucket, s3_key) DO UPDATE SET sha256 = EXCLUDED.sha256 RETURNING id`, [orgId, bucket, key, sha256])).rows[0];
      const contract = (await db.query(
        `INSERT INTO contracts (subscription_id, source_file_id, extraction_status, extraction_model, extracted_at)
         VALUES ($1,$2,$3,$4, now()) RETURNING id`, [sub.id, file.id, result.status, result.model || null])).rows[0];
      if (result.status === "extracted") {
        for (const [name, f] of Object.entries(result.fields)) {
          if (name === "seatReductionAllowedAtRenewal") continue; // surfaced in payload only
          await db.query(
            `INSERT INTO contract_fields (contract_id, field_name, value, confidence, page, snippet) VALUES ($1,$2,$3,$4,$5,$6)`,
            [contract.id, name, f.value == null ? null : JSON.stringify(f.value), f.confidence, f.page, f.snippet]);
        }
      }
    });
    results.push({ key, status: result.status, reason: result.reason });
  }
  console.log(JSON.stringify(results));
  return results;
}
