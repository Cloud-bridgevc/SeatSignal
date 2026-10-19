# SeatSignal architecture

## Overview

```
 Browser (web app)                                AWS account (per region)
 ─────────────────                                ─────────────────────────────────────────────────────────
  Upload contract PDF ──► API (auth, presigned URL) ──► S3  <org>/contracts/<sub>/x.pdf ──► Lambda contract-extraction ──► Bedrock (Claude)
  Upload usage CSV    ──► API (auth, presigned URL) ──► S3  <org>/usage/<sub>/<from>_<to>/x.csv ──► Lambda usage-import
                                                                                                        │
                                                        EventBridge Scheduler (daily) ──► Lambda scheduled-checks ──► Bedrock (narratives)
                                                                                                        │
                                                                                  Aurora PostgreSQL (private subnets)
```

| Concern | Service | Notes |
|---|---|---|
| Subscription & license records | Aurora PostgreSQL Serverless v2 | Schema in `backend/db/schema.sql`. Guardrails are enforced by constraints (see below) |
| Contracts & imported reports | Amazon S3 | KMS-encrypted, versioned, public access blocked, TLS-only bucket policy. Keys are prefixed by org id |
| Contract analysis | Amazon Bedrock: Claude (`anthropic.claude-opus-5-5` by default) | JSON-schema structured output. Every field carries its source passage, page and confidence |
| Recommendation narratives & executive summaries | Amazon Bedrock | Drafted from an engine-computed fact sheet and validated before storage |
| Scheduled checks | AWS Lambda + EventBridge Scheduler | Daily renewal-risk, anomaly and recommendation refresh |
| Secrets | Secrets Manager (RDS-managed master secret, HubSpot private-app token) | |

Lambdas run in private subnets. Add VPC endpoints for S3 (gateway), Secrets Manager, and Bedrock Runtime (interface) so no NAT gateway is needed. The template does not create these; add them for your VPC.

## Who computes what

| Output | Computed by | Why |
|---|---|---|
| Seat counts, utilization, unassigned/departed seats, anomalies, renewal windows, savings estimates | `web/js/engine.js`. One deterministic engine shared by the browser demo and the Lambdas (copied to `backend/shared/engine.cjs` by `npm run sync-engine`) | Numbers must be reproducible and auditable |
| Contract field extraction | Bedrock | Reading unstructured documents is what the model is good at. Results are stored as *unreviewed* until a person confirms them |
| Narrative text | Bedrock, checked by `validateNarrative` in `backend/shared/bedrock.mjs` | Every number in the narrative must appear in the fact sheet. Usage language is rejected if no usage was imported. Claims of automatic action are rejected. On any failure, a deterministic template is used and the source is recorded as `template` |

Refusals (`stop_reason: "refusal"`) and truncated responses are never retried blindly. Extraction is marked `needs_manual_review`, and narratives fall back to the template.

## Guardrails and where they live

| Rule | Enforcement |
|---|---|
| Don't claim usage without imported data | Engine: utilization is computed only from a `usage_imports` row. Schema: `recommendations` with `basis = 'usage_import'` must reference `usage_import_id`. Narrative validator. Covered by tests in `scripts/verify-engine.mjs` and `backend/test/` |
| Never disable accounts or cancel subscriptions | No IAM permissions or credentials for vendor or IdP admin APIs exist anywhere in the stack. The engine exposes no mutation functions (checked by test). The workflow's "approved" state only records a decision |
| Estimated ≠ verified | Estimates live on `recommendations`. Verified amounts live in `verified_savings`, which requires a verifier and a non-empty evidence reference. `savings_summary` reports them in separate columns |
| Auditable decisions | `workflow_events` is append-only (trigger), and rejections require a note |
| Sample data is labeled | `organizations.is_sample`, the dataset `meta.isSampleData`, and persistent banners in the UI |

## Usage data sources

1. **Manual exports (default).** A person uploads a vendor admin-console CSV with `email, last_active_date[, active_days_in_period]`. The uploader and source label are recorded.
2. **Authorized integrations (optional).** These are read-only connectors using the narrowest scope a vendor offers. They write `usage_imports` rows with `integration_id` set. If an integration stops working, its data simply ages. Imports older than 45 days lower confidence, and SeatSignal never extrapolates.

"Active" means the vendor recorded activity within the last 60 days of the report period (configurable) **and** the person is still employed according to the HRIS roster. Reports shorter than 60 days, with unmatched rows, or with assigned users missing from the report lower the confidence level, and the reason is shown.

## Deploying (outline)

```bash
cd backend
npm install
npm run sync-engine
sam build && sam deploy --guided   # supply VpcId, PrivateSubnetIds
psql "$DATABASE_URL" -f db/schema.sql
```

Enable model access for the chosen Claude model in the Bedrock console for your region, and narrow the `bedrock:InvokeModel` resource in `template.yaml` to that model's ARN. The template has not been deployed as part of this repository. Review it against your account's networking and security standards first.

The web app in `web/` is a static demo that runs entirely in the browser on fictional data. A production front end would add authentication (for example Cognito), an API (API Gateway + Lambda) that issues presigned S3 upload URLs and serves data from PostgreSQL, and per-org authorization on every query.
