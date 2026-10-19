# HubSpot CRM plan

How SeatSignal uses HubSpot for go-to-market and onboarding. This is a plan: nothing here has been configured in a real HubSpot portal, and the demo site's form does not transmit anything.

## Principles

- **HubSpot holds relationship data only.** Customer subscription records, employee rosters, usage reports and contract files never leave SeatSignal's AWS account. HubSpot receives account-level milestones (for example "first usage import completed") and never the underlying data.
- **Claims in sales and marketing emails match the product.** Templates never promise savings. They say "estimated opportunity" for estimates and "verified savings" only for amounts a customer's finance team has confirmed and agreed to share.
- **Consent first.** The demo form has an explicit contact-consent checkbox, mapped to a HubSpot subscription type. Nurture workflows only enroll contacts who have consented.

## Data model

### Contact properties (custom)

| Property | Internal name | Type | Source |
|---|---|---|---|
| SeatSignal team | `seatsignal_team` | Dropdown: it, finance, procurement, security, other | Demo form |
| Company size band | `company_size` | Dropdown: 1–249, 250–999, 1,000–4,999, 5,000+ | Demo form |
| Plan of interest | `plan_interest` | Dropdown: Team, Business, Enterprise | Demo form / pricing CTA |
| Persona | `seatsignal_persona` | Calculated: IT team, Finance department, Procurement leader, Enterprise prospect | Workflow 1 |
| Audit worksheet used | `audit_worksheet_used` | Boolean | Site event (optional, with consent) |

### Company properties (custom)

| Property | Internal name | Type | Notes |
|---|---|---|---|
| SeatSignal workspace ID | `seatsignal_org_id` | Single-line text | Set at provisioning |
| Onboarding stage | `seatsignal_onboarding_stage` | Dropdown (see pipeline below) | Synced from product |
| Usage data coverage % | `seatsignal_usage_coverage_pct` | Number | Share of per-seat spend with imported usage. A coverage figure, not a usage claim |
| Verified savings to date | `seatsignal_verified_savings` | Number | Only amounts verified in-product **and** cleared by the customer for sharing |
| Next renewal decision date | `seatsignal_next_decision_date` | Date | For CSM check-ins |

### Pipelines

**Sales pipeline: "SeatSignal New Business"**
1. Demo requested → 2. Discovery held → 3. Scoped audit agreed → 4. Audit readout → 5. Proposal → 6. Closed won / Closed lost

**Onboarding pipeline: "SeatSignal Onboarding"** (ticket pipeline)
1. Kickoff scheduled → 2. Contracts uploaded → 3. HRIS & IdP exports imported → 4. First usage report imported → 5. First recommendations reviewed → 6. First approval decision recorded → 7. Live (90-day review)

## Lead routing (Workflow 1: "Demo request — route & assign")

Trigger: form submission of *Website — Request a demo*. The demo site mirrors this logic in `web/js/site.js`.

| Condition (first match wins) | Persona | Owner / queue | SLA |
|---|---|---|---|
| `company_size` is 1,000–4,999 or 5,000+ | Enterprise prospect | Enterprise AE (round-robin) | 4 business hours |
| `seatsignal_team` = finance | Finance department | Mid-market AE, finance specialist | 1 business day |
| `seatsignal_team` = procurement | Procurement leader | Mid-market AE, procurement specialist | 1 business day |
| `seatsignal_team` = it or security | IT team | Mid-market AE, IT specialist | 1 business day |
| otherwise | General prospect | SDR queue | 2 business days |

Actions: set lifecycle stage to *Sales qualified lead*, create a deal in "Demo requested", create a task for the owner, and send an internal Slack/email notification. Free-mail domains are blocked at the form level.

## Persona nurture workflows

Enroll only if consent is given and the contact is not in an open deal. Each is 4 emails over about 3 weeks, and unenrolls when a meeting is booked.

### Workflow 2: IT teams
- Email 1: "Who holds which license?" How SeatSignal maps identity-provider assignments to the HRIS roster, plus a sample evidence trail (fictional data).
- Email 2: Offboarding gaps. Finding licenses still assigned to people who have left, with the reminder that SeatSignal recommends and the IT team acts.
- Email 3: Usage imports. Which vendor admin exports work, and why subscriptions without data stay "unknown".
- Email 4: Invitation to a 30-minute walkthrough.

### Workflow 3: Finance departments
- Email 1: The renewal calendar. Exposure by month, plus notice deadlines.
- Email 2: Estimated vs. verified. How the savings ledger keeps forecasts honest.
- Email 3: Spend anomalies. Unit-price increases and seat growth versus headcount, tied to invoices.
- Email 4: A sample executive report (fictional data) and a meeting CTA.

### Workflow 4: Procurement leaders
- Email 1: Contract terms with sources. Notice periods, price caps and seat-reduction clauses.
- Email 2: Overlapping tools. How overlaps are ranked, and why they are presented as investigations rather than verdicts.
- Email 3: Approval workflow and audit trail.
- Email 4: A meeting CTA with a negotiation-prep checklist.

## Workflow 5: Enterprise prospects (account-based)

Trigger: company `numberofemployees` ≥ 1,000 **and** (demo request **or** ≥ 2 contacts engaged in 14 days).
- Create or associate the company record and assign the enterprise AE as company owner.
- Create tasks: security questionnaire pack, architecture overview (`docs/ARCHITECTURE.md`), data-residency discussion.
- Add contacts to a "buying committee" list, tagging IT / Finance / Procurement personas.
- When the deal enters *Scoped audit agreed*, create an onboarding ticket in *Kickoff scheduled* so CS is engaged before close.

## Workflow 6: Customer onboarding

Trigger: deal moves to *Closed won*.
1. Create a ticket in the onboarding pipeline, assign the CSM, and set `seatsignal_onboarding_stage` = Kickoff scheduled.
2. Send the kickoff email with the data checklist: contracts, HRIS export, IdP assignment export, and 1–3 vendor activity exports.
3. **Product → HubSpot sync** (a nightly Lambda calls the HubSpot CRM API with a private-app token stored in Secrets Manager) updates the stage when these milestones are reached in SeatSignal:
   - first contract extracted → *Contracts uploaded*
   - HRIS and IdP imports present → *HRIS & IdP exports imported*
   - first usage import → *First usage report imported*
   - first recommendation opened → *First recommendations reviewed*
   - first workflow event of `approved` or `rejected` → *First approval decision recorded*
4. Stalled-stage alerts: if the stage is unchanged for 10 business days, create a CSM task. If it is still unchanged after 20 days, notify the account owner.
5. At *Live*, schedule the 90-day review and enroll the customer in the quarterly renewal-planning email series. That series uses the account's `seatsignal_next_decision_date`.

The sync sends **only** the properties listed above. `seatsignal_verified_savings` is synced only when the customer's admin has enabled "share verified savings with SeatSignal" in workspace settings.

## Form integration

The production site posts the demo form to the HubSpot Forms API (`POST https://api.hsforms.com/submissions/v3/integration/submit/{portalId}/{formGuid}`) with these fields: `firstname`, `lastname`, `email`, `company`, `seatsignal_team`, `company_size`, `plan_interest`, `message`, plus the `legalConsentOptions` block for the consent checkbox and the `hutk` cookie for attribution (if the visitor accepted analytics cookies). The demo site validates the form but deliberately sends nothing.

## Reporting

- Funnel by persona: demo requests → discovery → audit → won.
- Time-to-value: closed-won to *First usage report imported*, and to *First approval decision recorded*.
- Onboarding health: accounts by stage, and stalled tickets.
