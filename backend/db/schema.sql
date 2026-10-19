-- SeatSignal PostgreSQL schema (PostgreSQL 15+ / Aurora PostgreSQL)
-- Design rules encoded in constraints:
--   * usage-based recommendations must reference the usage import they rely on
--   * savings are only "verified" with an amount, a verifier and an evidence reference
--   * workflow history is append-only
--   * nothing here stores credentials that could change vendor accounts

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE organizations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  is_sample     boolean NOT NULL DEFAULT false,      -- demo tenants are always flagged
  hubspot_company_id text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE app_users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email         citext UNIQUE,
  display_name  text NOT NULL,
  role          text NOT NULL CHECK (role IN ('admin', 'it', 'finance', 'procurement', 'owner', 'viewer'))
);

-- Source files (contracts, HRIS roster, IdP export, AP export, usage reports) live in S3.
CREATE TABLE source_files (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  kind          text NOT NULL CHECK (kind IN ('contract', 'hris_roster', 'idp_assignments', 'ap_invoices', 'usage_report')),
  s3_bucket     text NOT NULL,
  s3_key        text NOT NULL,
  sha256        text NOT NULL,
  uploaded_by   uuid REFERENCES app_users(id),
  uploaded_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (s3_bucket, s3_key)
);

CREATE TABLE employees (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  external_id   text NOT NULL,                       -- HRIS employee id
  full_name     text NOT NULL,
  email         citext NOT NULL,
  department    text,
  status        text NOT NULL CHECK (status IN ('active', 'terminated', 'leave')),
  terminated_on date,
  source_file_id uuid REFERENCES source_files(id),
  UNIQUE (org_id, external_id),
  UNIQUE (org_id, email)
);

CREATE TABLE vendors (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name          text NOT NULL,
  UNIQUE (org_id, name)
);

CREATE TABLE subscriptions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  vendor_id     uuid NOT NULL REFERENCES vendors(id),
  slug          text NOT NULL,
  name          text NOT NULL,
  category      text NOT NULL,
  owner_team    text,
  owner_user_id uuid REFERENCES app_users(id),
  seats         integer CHECK (seats IS NULL OR seats >= 0),   -- NULL = not seat-based
  per_seat_monthly numeric(12,2),
  flat_annual   numeric(14,2),
  annual_cost   numeric(14,2) NOT NULL,
  currency      char(3) NOT NULL DEFAULT 'USD',
  renewal_date  date NOT NULL,
  term_months   integer,
  auto_renew    boolean,
  notice_days   integer,                             -- NULL = not found in contract
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended')),
  UNIQUE (org_id, slug)
);

CREATE TABLE contracts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  source_file_id  uuid NOT NULL REFERENCES source_files(id),
  extraction_status text NOT NULL DEFAULT 'pending'
    CHECK (extraction_status IN ('pending', 'extracted', 'needs_manual_review', 'failed')),
  extraction_model text,
  extracted_at    timestamptz,
  reviewed_by     uuid REFERENCES app_users(id),     -- extracted fields are never trusted until reviewed
  reviewed_at     timestamptz
);

CREATE TABLE contract_fields (
  contract_id   uuid NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  field_name    text NOT NULL CHECK (field_name IN ('subscriptionName', 'seats', 'annualCost', 'termMonths', 'renewalDate', 'autoRenew', 'noticeDays', 'priceIncreaseCap')),
  value         jsonb,                                -- NULL when not found
  confidence    text NOT NULL CHECK (confidence IN ('high', 'medium', 'low', 'none')),
  page          integer,
  snippet       text NOT NULL,                        -- verbatim passage, or "not found" explanation
  corrected_value jsonb,                              -- set by a human reviewer
  PRIMARY KEY (contract_id, field_name)
);

-- Employee-to-license mapping from the identity-provider export.
CREATE TABLE license_assignments (
  subscription_id uuid NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  employee_id     uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  assigned_at     date,
  source_file_id  uuid REFERENCES source_files(id),
  PRIMARY KEY (subscription_id, employee_id)
);

-- A usage import is the ONLY basis for any statement about application usage.
CREATE TABLE usage_imports (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  source_file_id  uuid REFERENCES source_files(id),
  integration_id  text,                               -- set when produced by an authorized read-only integration
  source_label    text NOT NULL,
  period_start    date NOT NULL,
  period_end      date NOT NULL,
  imported_by     uuid REFERENCES app_users(id),
  imported_at     timestamptz NOT NULL DEFAULT now(),
  row_count       integer NOT NULL,
  unmatched_count integer NOT NULL DEFAULT 0,
  CHECK (period_end >= period_start),
  CHECK (source_file_id IS NOT NULL OR integration_id IS NOT NULL)
);

CREATE TABLE usage_records (
  import_id       uuid NOT NULL REFERENCES usage_imports(id) ON DELETE CASCADE,
  email           citext NOT NULL,
  employee_id     uuid REFERENCES employees(id),      -- NULL when unmatched to HRIS
  last_active_date date,
  active_days_in_period integer,
  PRIMARY KEY (import_id, email)
);

CREATE TABLE invoices (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  invoice_ref     text NOT NULL,
  period_label    text NOT NULL,                      -- e.g. 2026-Q3
  seats           integer,
  amount          numeric(14,2) NOT NULL,
  source_file_id  uuid REFERENCES source_files(id),
  UNIQUE (subscription_id, invoice_ref)
);

CREATE TABLE headcount_snapshots (
  org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  period_label  text NOT NULL,
  headcount     integer NOT NULL,
  PRIMARY KEY (org_id, period_label)
);

-- Output of the analysis engine (scheduled-checks Lambda).
CREATE TABLE recommendations (
  id              text NOT NULL,                      -- deterministic, e.g. rightsize:<subscription slug>
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  subscription_id uuid NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  type            text NOT NULL CHECK (type IN ('rightsize', 'departed', 'unassigned', 'overlap', 'usage_gap')),
  basis           text NOT NULL CHECK (basis IN ('usage_import', 'hris', 'license_mapping', 'data_gap')),
  usage_import_id uuid REFERENCES usage_imports(id),
  confidence      text NOT NULL,
  payload         jsonb NOT NULL,                     -- evidence, data gaps, next steps (engine output)
  estimate_low    numeric(14,2),
  estimate_high   numeric(14,2),
  narrative       text,
  narrative_source text CHECK (narrative_source IN ('bedrock', 'template')),
  narrative_model text,
  computed_at     timestamptz NOT NULL DEFAULT now(),
  superseded_at   timestamptz,
  PRIMARY KEY (org_id, id),
  -- A recommendation that relies on usage must name the import it relies on.
  CHECK (basis <> 'usage_import' OR usage_import_id IS NOT NULL),
  CHECK ((estimate_low IS NULL) = (estimate_high IS NULL)),
  CHECK (estimate_low IS NULL OR estimate_low <= estimate_high)
);

CREATE TABLE renewal_alerts (
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  subscription_id uuid NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  kind            text NOT NULL,
  severity        text NOT NULL CHECK (severity IN ('critical', 'warning', 'info')),
  message         text NOT NULL,
  due_date        date NOT NULL,
  first_seen_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at    timestamptz NOT NULL DEFAULT now(),
  resolved_at     timestamptz,
  PRIMARY KEY (subscription_id, kind, message)
);

-- Review & approval workflow. Current status is derived from the latest event.
CREATE TABLE workflow_events (
  id              bigserial PRIMARY KEY,
  org_id          uuid NOT NULL,
  recommendation_id text NOT NULL,
  to_status       text NOT NULL CHECK (to_status IN ('open', 'in_review', 'approved', 'rejected', 'actioned', 'verified')),
  actor_id        uuid NOT NULL REFERENCES app_users(id),
  note            text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (org_id, recommendation_id) REFERENCES recommendations(org_id, id),
  CHECK (to_status <> 'rejected' OR coalesce(length(trim(note)), 0) > 0)
);

CREATE OR REPLACE FUNCTION forbid_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'workflow_events is append-only';
END $$ LANGUAGE plpgsql;
CREATE TRIGGER workflow_events_append_only BEFORE UPDATE OR DELETE ON workflow_events
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

-- Verified savings are separate from estimates and need documentary evidence.
CREATE TABLE verified_savings (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL,
  recommendation_id text NOT NULL,
  annual_amount     numeric(14,2) NOT NULL CHECK (annual_amount >= 0),
  evidence_ref      text NOT NULL CHECK (length(trim(evidence_ref)) > 0),  -- amended order / credit memo / invoice
  evidence_file_id  uuid REFERENCES source_files(id),
  verified_by       uuid NOT NULL REFERENCES app_users(id),
  verified_at       timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (org_id, recommendation_id) REFERENCES recommendations(org_id, id)
);

CREATE VIEW recommendation_status AS
SELECT r.org_id, r.id, coalesce(e.to_status, 'open') AS status, e.created_at AS status_at
FROM recommendations r
LEFT JOIN LATERAL (
  SELECT to_status, created_at FROM workflow_events w
  WHERE w.org_id = r.org_id AND w.recommendation_id = r.id
  ORDER BY w.id DESC LIMIT 1
) e ON true;

CREATE VIEW savings_summary AS
SELECT r.org_id,
  sum(r.estimate_low)  FILTER (WHERE s.status IN ('open', 'in_review') AND r.superseded_at IS NULL) AS estimated_open_low,
  sum(r.estimate_high) FILTER (WHERE s.status IN ('open', 'in_review') AND r.superseded_at IS NULL) AS estimated_open_high,
  sum(r.estimate_low)  FILTER (WHERE s.status IN ('approved', 'actioned')) AS approved_pending_low,
  sum(r.estimate_high) FILTER (WHERE s.status IN ('approved', 'actioned')) AS approved_pending_high,
  (SELECT coalesce(sum(v.annual_amount), 0) FROM verified_savings v WHERE v.org_id = r.org_id) AS verified
FROM recommendations r JOIN recommendation_status s ON s.org_id = r.org_id AND s.id = r.id
GROUP BY r.org_id;

CREATE INDEX ON subscriptions (org_id, renewal_date);
CREATE INDEX ON usage_imports (subscription_id, period_end DESC);
CREATE INDEX ON workflow_events (org_id, recommendation_id, id DESC);
