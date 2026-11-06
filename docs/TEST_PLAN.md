# AdBoardQA Test Plan

## 1. Scope

AdBoardQA validates the DOOH campaign scheduling workflow from campaign creation through
publication. The plan covers:

- the Express REST API and its pure domain rules (`app/src/domain/campaign.ts`),
- the Vanilla TypeScript UI served by Vite,
- the browser-level Cypress journey with network interception and failure simulation,
- the contract between UI and API for every endpoint the UI calls.

Out of scope: real DOOH player delivery, creative asset ingestion, authentication providers,
persistent production databases, and third-party ad-server integrations. The app uses a seeded
JSON store so that every run is deterministic.

## 2. Workflow under test

```
Campaign list
   │
   ├─ Create campaign (draft)
   │      name, advertiser, budget, start/end window
   │
   ├─ Schedule flights (still draft)
   │      screen, start/end dates inside the campaign window, daily budget
   │      → totals: booked budget, remaining budget, impressions, blended CPM
   │
   ├─ Submit for approval (draft → pending_approval)
   │      requires at least one flight; locks flight edits
   │
   ├─ Reviewer decision
   │      approve → approved     (requires a different reviewer)
   │      reject  → draft        (requires a reason; records last rejection)
   │
   └─ Publish (approved → live)
```

The four UI screens are: campaign list, campaign builder, flight scheduler, and the
review/approve/publish panel. The state machine has four statuses (`draft`,
`pending_approval`, `approved`, `live`) and four events (`submit`, `approve`, `reject`,
`publish`).

## 3. Risk-based priority

| Area | Risk | Why | Priority |
| --- | --- | --- | --- |
| Approval segregation | Critical | A planner approving their own spend defeats financial control (ADQA-011). | P0 |
| Budget and pricing arithmetic | High | Negative or overflowing flight budgets corrupt spend commitments (ADQA-001). | P0 |
| Campaign / flight editing after lock | High | Post-approval edits bypass the review gate (ADQA-006). | P0 |
| Duplicate submission | High | Double-clicking can create duplicate campaigns and duplicate billing (ADQA-005). | P0 |
| Transition state machine | High | Publishing a draft or re-approving a live campaign breaks the release contract. | P0 |
| Overlap and date windows | Medium | Incorrect overlap detection blocks valid inventory or allows double-booking (ADQA-002/003). | P1 |
| Network/API failures | Medium | Users need a recovery path when the API is unavailable (ADQA-008/009/010). | P1 |
| Money display accuracy | Medium | A plan can be approved on the wrong displayed total (ADQA-007). | P1 |
| Name and field bounds | Low | Long names are a data-quality issue, not a spend issue (ADQA-004). | P2 |
| REST contract drift | Medium | UI assumptions silently break when payload shape changes. | P1 |

## 4. Smoke vs regression split

`@smoke` is a four-test, eight-second confidence gate: one creation path, one flight booking,
one submit/approve path, and the complete create → schedule → approve → publish journey. It is
deliberately narrow: it answers “is the product usable right now?” and runs first on every pull
request.

`@regression` is the broad safety net: validation boundaries, every illegal transition, budget
and overlap mathematics, deletion and recomputation, REST schemas for every UI endpoint,
network/server failure handling, and one named test per exploratory defect. Regression runs only
after smoke passes, and is sharded two ways in CI.

Rationale: smoke must stay fast enough to block a broken build immediately. Regression can spend
longer because it protects the rules and edge cases that are expensive to debug after release.
No test carries both tags, which keeps the counts unambiguous.

## 5. Traceability matrix — business rules

| Rule | Statement | Covering test(s) |
| --- | --- | --- |
| BR-01 | Campaign name, advertiser, budget, start and end are required; name ≤ 120 characters. | `campaign-create.cy.ts` “shows inline field errors for every required campaign field”; ADQA-004; domain unit tests. |
| BR-02 | Campaign end date must be strictly after start date. | `campaign-create.cy.ts` “rejects a campaign whose end date is before its start date”. |
| BR-03 | Campaign budget is a positive whole number of cents and within the ceiling. | `campaign-create.cy.ts` “rejects a zero-dollar campaign budget”; domain unit tests. |
| BR-04 | Flight dates must sit inside the campaign window; flight end ≥ start; same-day flights are valid. | ADQA-002; domain unit tests; flight-window/out-of-window unit cases. |
| BR-05 | Daily flight budget must be a positive whole number of cents. | ADQA-001; domain unit tests. |
| BR-06 | Sum of flight costs may not exceed the campaign budget. | `flight-scheduling.cy.ts` “rejects a flight that overflows the campaign budget”; domain unit tests. |
| BR-07 | A screen cannot have overlapping flights on the same campaign; adjacent ranges are allowed. | `flight-scheduling.cy.ts` “rejects overlapping dates…”; ADQA-003; domain unit tests. |
| BR-08 | Flights can only be added or deleted while the campaign is a draft. | ADQA-006; `approval-workflow.cy.ts` “cannot submit a campaign with no flights” indirectly checks the draft gate. |
| BR-09 | Status transitions follow draft → pending_approval → approved → live; reject returns to draft. | `approval-workflow.cy.ts` “submits and approves…”, “rejects with a reason…”, “refuses every illegal status transition with 409”; unit test table covers all 16 status/event pairs. |
| BR-10 | Approval requires a reviewer and that reviewer must not be the creator. | “requires a reviewer header to approve”; ADQA-011. |
| BR-11 | Rejection requires a non-empty reason and is recorded. | “rejects a missing rejection reason…”; “rejects with a reason…”. |
| BR-12 | Publish is legal only from approved. | “publishes an approved campaign to live”; illegal-transition table. |
| BR-13 | Flight costs, totals and remaining budget are accurate to the cent in UI and API. | ADQA-007; “books a flight and computes cost and impressions”; “deletes a flight and recomputes the totals”. |
| BR-14 | The UI recovers from server/network failures with retry or an explicit conflict message. | ADQA-008, ADQA-009, ADQA-010; resilience spec. |
| BR-15 | Every endpoint the UI calls honours the documented REST contract. | `api-contract.cy.ts` (six tests, all UI endpoints plus reset and 409). |

## 6. Traceability matrix — defects

| Defect | Named regression test | File:line |
| --- | --- | --- |
| ADQA-001 | rejects a negative daily flight budget | `cypress/e2e/defect-regressions.cy.ts:19` |
| ADQA-002 | accepts a same-day flight | `cypress/e2e/defect-regressions.cy.ts:38` |
| ADQA-003 | accepts adjacent, non-overlapping flights on one screen | `cypress/e2e/defect-regressions.cy.ts:59` |
| ADQA-004 | rejects a 300-character campaign name | `cypress/e2e/defect-regressions.cy.ts:83` |
| ADQA-005 | double-clicking create sends exactly one POST | `cypress/e2e/defect-regressions.cy.ts:99` |
| ADQA-006 | refuses to delete a flight after approval or publish | `cypress/e2e/defect-regressions.cy.ts:129` |
| ADQA-007 | shows cent-accurate flight costs and totals | `cypress/e2e/defect-regressions.cy.ts:152` |
| ADQA-008 | retryable error banner on create 500 | `cypress/e2e/resilience.cy.ts:15` |
| ADQA-009 | screens empty state with retry | `cypress/e2e/resilience.cy.ts:43` |
| ADQA-010 | conflict message on publish 409 | `cypress/e2e/resilience.cy.ts:73` |
| ADQA-011 | reviewer cannot approve their own campaign | `cypress/e2e/defect-regressions.cy.ts:173` |

## 7. Test inventory

| Spec | Purpose | Tests |
| --- | --- | --- |
| `campaign-create.cy.ts` | Builder happy path and validation boundaries | 4 |
| `flight-scheduling.cy.ts` | Booking, budget overflow, overlap, deletion and recomputation | 4 |
| `approval-workflow.cy.ts` | Submit/approve/reject/publish plus every illegal transition | 7 |
| `end-to-end-publish.cy.ts` | One journey from create to live, checked in UI and API | 1 |
| `api-contract.cy.ts` | Method, URL, request/response schema, 201/422/409 | 6 |
| `resilience.cy.ts` | 500, network error, 409 conflict, delayed response, loading state | 4 |
| `defect-regressions.cy.ts` | One named regression test per exploratory defect | 8 |
| **Total** | | **34** |

Smoke: 4 tests. Regression: 30 tests.

## 8. Unit-test strategy

`app/test/domain.test.ts` exercises every exported pure function in
`app/src/domain/campaign.ts`: ISO date parsing, inclusive day counting, money formatting,
campaign and flight validation, overlap detection, budget overflow, flight metrics, campaign
totals, and the complete 4 × 4 status/event transition table (4 legal, 12 illegal). Coverage is
enforced at 90% statements/branches/functions/lines for that module.

## 9. Entry and exit criteria

**Entry:** `npm run dev` serves API and UI; `POST /api/test/reset` returns 200; the seed exposes
6 screens and 4 campaigns.

**Exit:** `npm run typecheck`, `npm run lint`, `npm run test:unit`, and `npm run test:e2e` all
pass; every defect in `DEFECT_LOG.md` has a green named test; the smoke suite passes on its own;
the triage report is generated from the same run.
