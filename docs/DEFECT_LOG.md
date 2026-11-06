# AdBoardQA Defect Log

Manual exploratory session date: 2026-11-05. Environment: local Node 20+ API on
`http://localhost:3001`, Vite UI on `http://localhost:5173`, deterministic seed via
`POST /api/test/reset`. Every entry below was reproduced against the running app before it was
fixed, and every entry now has a passing named regression test.

**Severity summary:** 1 Critical · 4 High · 5 Medium · 1 Low. **Total: 11 defects.** All 11 are
covered by named regression tests.

| ID | Title | Severity | Component | Regression test |
| --- | --- | --- | --- | --- |
| ADQA-001 | Negative daily flight budget accepted | High | domain / API | `cypress/e2e/defect-regressions.cy.ts:19` |
| ADQA-002 | Same-day flights rejected | Medium | domain | `cypress/e2e/defect-regressions.cy.ts:38` |
| ADQA-003 | Adjacent flights falsely rejected as overlapping | Medium | domain | `cypress/e2e/defect-regressions.cy.ts:59` |
| ADQA-004 | 300-character campaign names accepted | Low | domain / API | `cypress/e2e/defect-regressions.cy.ts:83` |
| ADQA-005 | Double-click creates duplicate campaigns | High | web UI | `cypress/e2e/defect-regressions.cy.ts:99` |
| ADQA-006 | Flights can be deleted after approval or publish | High | store / API | `cypress/e2e/defect-regressions.cy.ts:129` |
| ADQA-007 | Flight costs and totals drop cents in the UI | Medium | web UI | `cypress/e2e/defect-regressions.cy.ts:152` |
| ADQA-008 | Create 500 has no retryable error banner | Medium | web UI | `cypress/e2e/resilience.cy.ts:15` |
| ADQA-009 | Screens network failure has no empty state or retry | High | web UI | `cypress/e2e/resilience.cy.ts:43` |
| ADQA-010 | Publish conflict is rendered as a generic form error | Medium | web UI | `cypress/e2e/resilience.cy.ts:73` |
| ADQA-011 | Creators can approve their own campaigns | Critical | store / API | `cypress/e2e/defect-regressions.cy.ts:173` |

---

## ADQA-001 — Negative daily flight budget accepted

- **Severity:** High
- **Affected component:** `app/src/domain/campaign.ts` (`validateDailyBudget`), reached through
  `app/src/store.ts` (`addFlight`)
- **Steps to reproduce:**
  1. `POST /api/test/reset`.
  2. Create a campaign for 2026-08-01 → 2026-08-31 with an $8,000 budget.
  3. `POST /api/campaigns/{id}/flights` with
     `{"screenId":"scr_airport_01","startDate":"2026-08-03","endDate":"2026-08-10","dailyBudgetCents":-50000}`.
- **Expected:** `422` with `{error:{code:"DAILY_BUDGET_INVALID", field:"dailyBudgetCents"}}`.
- **Actual:** `201`; the flight was created and totals became
  `bookedBudgetCents: -400000`, `remainingBudgetCents: 1200000`.
- **Root cause:** `validateDailyBudget` only asserted that the value was an integer; it did not
  require a positive amount.
- **Fix:** require a positive integer, with the message
  “Daily budget must be a positive whole number of cents”.
- **Regression test:** `cypress/e2e/defect-regressions.cy.ts:19` — passes after the fix.

## ADQA-002 — Same-day flights rejected

- **Severity:** Medium
- **Affected component:** `app/src/domain/campaign.ts` (`validateFlightWindow`)
- **Steps to reproduce:**
  1. Open the scheduler for a campaign covering 2026-08-01 → 2026-08-31.
  2. Add a flight for 2026-08-05 → 2026-08-05.
- **Expected:** a one-day flight is accepted (`201`, `days: 1`, cost equals one day's budget).
- **Actual:** `422 FLIGHT_WINDOW_INVALID`, “Flight end date must be after start date”.
- **Root cause:** the flight window used `end <= start`, which is the campaign-level rule, not the
  flight-level rule. A flight occupies whole days inclusively, so `end === start` is valid.
- **Fix:** reject only `end < start`; message is now “on or after start date”.
- **Regression test:** `cypress/e2e/defect-regressions.cy.ts:38`.

## ADQA-003 — Adjacent flights falsely rejected as overlapping

- **Severity:** Medium
- **Affected component:** `app/src/domain/campaign.ts` (`rangesOverlap`)
- **Steps to reproduce:**
  1. Book `scr_airport_01` from 2026-08-03 → 2026-08-10.
  2. Book the same screen from 2026-08-11 → 2026-08-15.
- **Expected:** both flights are accepted because the date ranges do not share a day.
- **Actual:** the second booking returns `422 FLIGHT_OVERLAP`.
- **Root cause:** the overlap predicate padded each range by one day on both sides, so
  back-to-back flights looked adjacent.
- **Fix:** use strict inclusive comparison: `aStart <= bEnd && aEnd >= bStart`.
- **Regression test:** `cypress/e2e/defect-regressions.cy.ts:59`.

## ADQA-004 — 300-character campaign names accepted

- **Severity:** Low
- **Affected component:** `app/src/domain/campaign.ts` (`validateCampaignName`)
- **Steps to reproduce:**
  1. Open `/#/campaigns/new`.
  2. Enter a 300-character campaign name, a valid advertiser, budget, and date window.
  3. Submit.
- **Expected:** `422` with a `name` field error (maximum 120 characters).
- **Actual:** `201`; the full 300-character name was persisted and shown in the UI.
- **Root cause:** `MAX_CAMPAIGN_NAME_LENGTH` existed but was never used by the validator.
- **Fix:** reject names longer than 120 characters after trimming.
- **Regression test:** `cypress/e2e/defect-regressions.cy.ts:83`.

## ADQA-005 — Double-click creates duplicate campaigns

- **Severity:** High
- **Affected component:** `web/src/pages/CampaignBuilderPage.ts`
- **Steps to reproduce:**
  1. Fill the campaign builder with valid values.
  2. Double-click **Create campaign** while the create request is delayed.
- **Expected:** exactly one `POST /api/campaigns` and one campaign.
- **Actual:** two POSTs reached the server, creating two campaigns with the same details.
- **Root cause:** the submit handler had no in-flight guard and the button was never disabled.
- **Fix:** an `inFlight` guard plus a disabled/“Creating…” button while the request is pending.
  The loading-state resilience test (delayed response) also locks the UI behaviour down.
- **Observed failing regression run (controlled reproduction before the guard was restored):**
  `AssertionError: expected 2 to equal 1`.
- **Regression test:** `cypress/e2e/defect-regressions.cy.ts:99`.

## ADQA-006 — Flights can be deleted after approval or publish

- **Severity:** High
- **Affected component:** `app/src/store.ts` (`deleteFlight`)
- **Steps to reproduce:**
  1. `GET /api/campaigns/cmp_seed_approved` and take its seeded flight id.
  2. `DELETE /api/campaigns/cmp_seed_approved/flights/{flightId}`.
  3. Repeat for `cmp_seed_live`.
- **Expected:** `409 CAMPAIGN_LOCKED`; the approved/live plan is immutable.
- **Actual:** `200`; the flight was removed from an approved campaign.
- **Root cause:** `addFlight` checked for draft status, but `deleteFlight` did not.
- **Fix:** require `draft` before deleting a flight, using the same `CAMPAIGN_LOCKED` conflict.
- **Regression test:** `cypress/e2e/defect-regressions.cy.ts:129`.

## ADQA-007 — Flight costs and totals drop cents in the UI

- **Severity:** Medium
- **Affected component:** `web/src/format.ts` (`formatCents`)
- **Steps to reproduce:**
  1. Create a campaign with an $8,000 budget.
  2. Add a flight from 2026-08-03 → 2026-08-05 at `10001` cents/day.
  3. Read the flight cost, booked total, and remaining budget in the scheduler.
- **Expected:** server total is `30003` cents; UI shows `$300.03`, `$300.03`, `$7,699.97`.
- **Actual:** UI shows `$300`, `$300`, and `$7,700` (also verified with the browser: the server
  returned `30003` while the DOM showed `$300`).
- **Root cause:** `formatCents` used `Math.round(cents / 100)` and printed whole dollars, so every
  amount lost its cents.
- **Fix:** floor to dollars and format the remainder as two digits.
- **Regression test:** `cypress/e2e/defect-regressions.cy.ts:152`.

## ADQA-008 — Create 500 has no retryable error banner

- **Severity:** Medium
- **Affected component:** `web/src/pages/CampaignBuilderPage.ts`
- **Steps to reproduce:** stub `POST /api/campaigns` with a `500` response via `cy.intercept`, then
  submit a valid campaign builder form.
- **Expected:** a visible error banner with a Retry action; retrying succeeds.
- **Actual:** only the inline form error area was used, with no recovery action.
- **Root cause:** all request failures were funnelled into the validation-error element.
- **Fix:** dedicated `data-cy="error-banner"` with `data-cy="retry-create"` for 5xx/network errors;
  field errors still render inline.
- **Observed failing regression output:**
  `Expected to find element: [data-cy="error-banner"], but never found it.`
- **Regression test:** `cypress/e2e/resilience.cy.ts:15`.

## ADQA-009 — Screens network failure has no empty state or retry

- **Severity:** High
- **Affected component:** `web/src/pages/FlightSchedulerPage.ts`
- **Steps to reproduce:** make the first `GET /api/screens` request fail at the network layer, then
  open a campaign scheduler.
- **Expected:** an empty state explaining the catalogue is unavailable, with a retry control.
- **Actual:** the page could not recover and did not expose a retry path.
- **Root cause:** campaign and screens were fetched with `Promise.all`, so a screens failure
  collapsed the whole page into a generic load error.
- **Fix:** load the campaign and screens independently; render `data-cy="screens-empty"` with
  `data-cy="retry-screens"`, which retries the catalogue load.
- **Observed failing regression output:**
  `Expected to find element: [data-cy="screens-empty"], but never found it.`
- **Regression test:** `cypress/e2e/resilience.cy.ts:43`.

## ADQA-010 — Publish conflict is rendered as a generic form error

- **Severity:** Medium
- **Affected component:** `web/src/pages/ApprovalPage.ts`
- **Steps to reproduce:** stub `POST /api/campaigns/**/publish` with a `409` response, then click
  Publish on an approved campaign.
- **Expected:** a distinct conflict message that explains the campaign state clash.
- **Actual:** only the generic form-error element was populated.
- **Root cause:** every API error was rendered through `showFormError`.
- **Fix:** `409` responses render `data-cy="conflict-message"` with the server message.
- **Observed failing regression output:**
  `Expected to find element: [data-cy="conflict-message"], but never found it.`
- **Regression test:** `cypress/e2e/resilience.cy.ts:73`.

## ADQA-011 — Creators can approve their own campaigns

- **Severity:** Critical
- **Affected component:** `app/src/store.ts` (`transition`)
- **Steps to reproduce:**
  1. Create a campaign as `planner@adboard.test` (the UI's default identity).
  2. Add a flight and submit it for approval.
  3. On the approval page, set the reviewer to `planner@adboard.test` and approve.
- **Expected:** `409 SELF_APPROVAL`; segregation of duties requires a different reviewer.
- **Actual:** `200`; the campaign moved to `approved`.
- **Root cause:** approval checked for a reviewer header but never compared the reviewer with
  `campaign.createdBy`.
- **Fix:** reject self-approval with `409 SELF_APPROVAL` and field `reviewer`; the UI renders it as
  a conflict message.
- **Regression test:** `cypress/e2e/defect-regressions.cy.ts:173`.

---

## Exploratory coverage that produced no defect

These were also exercised; the observed behaviour was correct, so they are recorded here rather
than as defects:

- Unicode campaign names (e.g. `キャンペーン Ünïcode`) persist and render correctly.
- Zero and negative **campaign** budgets are rejected; budgets over the $10,000,000 ceiling are
  rejected.
- Publishing a draft or a rejected-back-to-draft campaign returns `409`.
- Browser back/forward across the hash-routed flow returns to the correct step without losing
  server state.
- Rejecting without a reason returns `422` on the `reason` field and leaves the campaign pending.
