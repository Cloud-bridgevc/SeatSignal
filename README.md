# SeatSignal

SeatSignal is a SaaS subscription and license optimization platform for IT and finance teams. It consolidates subscription records, analyzes imported usage data, flags licenses that may be unused, and prepares evidence-backed renewal decisions.

> **All data in this repository is fictional sample data.** The company (Halcyon Freight Co.), people, vendors, contracts, prices, invoices and usage reports are invented for demonstration.

## What's here

| Path | What it is |
|---|---|
| `web/index.html` | Public website: product, interactive subscription audit, IT/finance/procurement use cases, pricing, demo request form |
| `web/app.html` | Application workspace (static demo): subscription inventory, vendor & contract register, employee-to-license mapping, usage imports, renewal calendar, cost analysis, AI recommendations, savings tracker, review & approval workflow, executive report |
| `web/js/engine.js` | Deterministic analysis engine shared by the browser and AWS Lambda |
| `web/data/sample-data.js`, `web/sample-data/*.csv` | Generated fictional dataset and the "imported" usage reports |
| `backend/` | AWS: PostgreSQL schema, Lambda functions (contract extraction, usage import, scheduled checks), Bedrock client, SAM template |
| `docs/ARCHITECTURE.md` | AWS architecture, who computes what, guardrails |
| `docs/HUBSPOT.md` | HubSpot CRM plan: lead routing, IT/finance/procurement/enterprise workflows, onboarding pipeline |
| `scripts/` | Sample-data generator and engine guardrail checks |

## Run the demo

```bash
python3 -m http.server 4173 --directory web
```

Then open http://localhost:4173 for the website and http://localhost:4173/app.html for the workspace.

### Suggested walkthrough

1. **Overview**: open the *Guided walkthrough* card for FlowBoard.
2. **Recommendation → Evidence trail**: follow the contract clause, the license map, the imported `flowboard_members_2026Q3.csv` report, HRIS departures, the calculation, and what SeatSignal *doesn't* know.
3. **Usage imports**: TaskTrack starts with *no* usage data, so SeatSignal only asks for data and makes no claim about it. Click *load the sample TaskTrack report*, import it, and watch utilization appear and the recommendations recalculate.
4. **Review & approval**: move a recommendation through review → approved → owner actioned → verified. Verification requires an evidence reference. Approving never changes accounts.
5. **Savings tracker / Executive report**: estimated, approved-pending and verified amounts are always shown separately.

Demo decisions and imports are kept in your browser's local storage. *Reset demo state* in the sidebar clears them.

## Checks

```bash
node scripts/verify-engine.mjs          # engine guardrails on the sample data
cd backend && npm install && npm test   # narrative validator & fact-sheet tests (offline)
```

Regenerate the sample data with `node scripts/generate-sample-data.mjs`. After changing `web/js/engine.js`, run `npm run sync-engine` in `backend/`.

## Product rules

- SeatSignal reports application usage only from imported reports or working, authorized read-only integrations. Otherwise, utilization is shown as **unknown**.
- SeatSignal never disables accounts or cancels subscriptions. Recommendations are proposals, and approvals record decisions that system owners carry out.
- Opportunities are **estimated ranges** with the method shown. Savings are **verified** only when someone records the confirming document.
