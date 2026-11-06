# AdBoardQA

AdBoardQA is an end-to-end quality engineering project for a Digital Out-of-Home (DOOH) campaign
scheduling application. The repository contains both halves of the problem: a real Node.js +
Express REST API with a Vanilla TypeScript/Vite front end that plans campaigns across airport,
mall and gym screens, and the actual deliverable — a Cypress + TypeScript suite that validates
the multi-step campaign workflow. The suite combines smoke/regression tagging, typed page
objects and custom commands, REST contract checks with a schema helper, network stubbing for
failure simulation, deterministic seeded fixtures, a manual-exploratory defect log where every
defect has a named regression test, and a GitHub Actions pipeline with videos, screenshots and a
failure triage summary.

## Architecture

```
                          ┌──────────────────────────┐
  browser / Cypress ─────▶│ web/  Vite + TypeScript  │
  (data-cy selectors)     │ 4 screens, hash router    │
                          └────────────┬─────────────┘
                                       │ /api proxy
                                       ▼
                          ┌──────────────────────────┐
                          │ app/  Express REST API   │
                          │ routes → store → domain  │
                          │ pure rules in campaign.ts│
                          └────────────┬─────────────┘
                                       ▼
                          ┌──────────────────────────┐
                          │ app/data/db.json         │
                          │ seeded, resettable store │
                          └──────────────────────────┘

  cypress/
    e2e/          7 specs, 34 tests, @smoke + @regression
    fixtures/     screens, campaign payloads, API responses
    support/
      pages/      4 typed page objects — all selectors live here
      commands.ts resetDb, seedCampaign, loginAs, apiCreateCampaign,
                  apiAddFlight, expectFieldError
      contracts.ts typed schema assertion helper + 11 endpoint schemas
      index.d.ts  declaration merging for the custom commands
```

```
AdBoardQA/
├── app/                       Express + TypeScript API
│   ├── src/domain/campaign.ts state machine, date windows, budgets, overlap, totals
│   ├── src/store.ts           seeded JSON store + optimistic-free mutations
│   ├── src/seed.ts            6 screens across 3 venues, 4 campaigns in 4 statuses
│   ├── src/routes/            campaigns.ts, screens.ts
│   ├── test/domain.test.ts    22 Vitest unit tests
│   └── Dockerfile
├── web/                       Vite + Vanilla TypeScript UI
│   ├── src/pages/             CampaignList, CampaignBuilder, FlightScheduler, Approval
│   ├── src/api.ts             typed fetch client and error envelope parsing
│   └── Dockerfile
├── cypress/                   Cypress 13 + TypeScript
│   ├── e2e/                   7 specs
│   ├── fixtures/              deterministic payloads
│   └── support/pages/         page objects (no selectors in specs)
├── docs/
│   ├── DEFECT_LOG.md          11 ADQA defects with reproduction and fixes
│   └── TEST_PLAN.md           risk priorities, smoke/regression split, traceability
├── scripts/
│   ├── triage.ts              JUnit/JSON → Markdown failure triage
│   ├── mocha-json-reporter.cjs
│   ├── shard-specs.mjs
│   └── coverage-summary.mjs
├── .github/workflows/ci.yml   typecheck+unit, smoke, 2-way regression shards, triage
├── docker-compose.yml         api, web, cypress (profile: test)
└── cypress.config.ts          baseUrl, retries, video, screenshots, @cypress/grep
```

**How the page-object layer keeps selectors out of specs.** Specs import a singleton page
object (`campaignListPage`, `campaignBuilderPage`, `flightSchedulerPage`, `approvalPage`) and
speak in intent: `.addFlight({ screenId: 'scr_airport_01', … })`, `.expectTotalCost('$3,600.00')`,
`.submitForApproval()`. Selectors such as `[data-cy="flight-form"]` and `[data-cy="total-cost"]`
exist only inside `cypress/support/pages/*.ts`. If the markup changes, one page object changes;
the seven specs do not. `cy.resetDb()` and `cy.seedCampaign()` keep setup deterministic, and the
typed declarations in `cypress/support/index.d.ts` make every custom command autocomplete and
type-check.

## Workflow under test

```
Campaign list ──▶ Builder ──▶ Flight scheduler ──▶ Review / approve / publish
                  draft       draft                  pending_approval ──▶ approved ──▶ live
                                                              │
                                                              └── reject (reason) ──▶ draft
```

| Step | Business rules enforced |
| --- | --- |
| Create campaign | Name, advertiser, budget, start and end required; name ≤ 120 chars; end > start; budget positive whole cents within the ceiling. |
| Schedule flights | Flight must sit inside the campaign window (same-day allowed); daily budget positive; summed flight cost ≤ campaign budget; a screen cannot overlap itself on the campaign (adjacent days are fine); flights editable only in `draft`. |
| Submit | Campaign must have at least one flight; `draft → pending_approval`; flights lock. |
| Approve / reject | Reviewer header required; reviewer must differ from the creator; `pending_approval → approved` or `pending_approval → draft` with a non-empty reason recorded. |
| Publish | `approved → live` only; any other current status returns `409 INVALID_TRANSITION`. |
| Totals | Inclusive day counts; flight cost = daily budget × days; booked, remaining, impressions, blended CPM and media value computed from the seed screens. |

Validation failures return `422 {error:{code,message,field}}`; state-machine conflicts return `409`
(and 404 for missing resources). The complete legal transition set is
`draft→pending_approval`, `pending_approval→approved`, `pending_approval→draft`,
`approved→live`; the other 12 status/event pairs are illegal and covered by a table-driven unit
test and an E2E matrix.

## How to run

Requirements: Node.js 20+ and npm. Install once from the repository root:

```bash
npm install
```

### Local

```bash
npm run dev          # API on :3001 and Vite UI on :5173, concurrently
npm run test:e2e     # all 34 Cypress tests
npm run test:smoke   # --env grepTags=@smoke
npm run test:regression
npm run cy:open      # interactive runner
npm run test:unit    # 22 Vitest domain tests
npm run test:unit -- --coverage
npm run typecheck
npm run lint
npm run triage -- cypress/reports
```

The app boots from a deterministic seed and exposes the test-only reset endpoint:

```bash
curl -X POST localhost:3001/api/test/reset
# {"ok":true,"screens":6,"campaigns":4}
```

### Docker

```bash
docker compose up api web
# UI:  http://localhost:5173
# API: http://localhost:3001

docker compose --profile test up --abort-on-container-exit
```

The `web` service waits for the API health check and proxies `/api` to `api:3001`. The `cypress`
service uses `cypress/included:13.17.0`, waits for both healthy services, and runs headlessly
against `http://web:5173`.

## Quality engineering practice

**Smoke vs. regression.** `@smoke` is four tests (creation, one booking, one approve, and the full
create → schedule → approve → publish journey). It is the fast PR gate. `@regression` is the
remaining 30 tests: field boundaries, budget mathematics, overlap rules, every illegal
transition, deletion and recomputation, REST schemas, failure recovery, and one named test per
exploratory defect. The suites are separate (`--env grepTags=…`) so a broken smoke run fails fast
and the broader regression matrix only starts after smoke is green. No test carries both tags.

**Retries and network synchronisation.** `cypress.config.ts` sets
`retries: { runMode: 2, openMode: 0 }`, so a genuine flake is retried twice but a deterministic
failure still fails the build. There are no `cy.wait(milliseconds)` calls. Specs wait on
`cy.intercept` aliases (`cy.wait('@createCampaign')`, `cy.wait('@screensFailure')`) or on
retry-able DOM assertions. Delays are injected with `request.reply({ delay: 1200, … })` to test
the loading state, not as a sleep.

**Failure simulation.** `resilience.cy.ts` proves the UI handles a create `500` with a retryable
banner, a screens network failure with an empty state and retry, a publish `409` with a conflict
message, and a delayed create with a visible loading state and disabled submit button.

**REST contracts.** `cypress/e2e/api-contract.cy.ts` captures real UI traffic with `cy.intercept`
for all 11 endpoints the UI calls (including the reset endpoint) and asserts method, URL, request
body, status code and response shape. A small typed `assertSchema` helper in
`cypress/support/contracts.ts` holds the schemas instead of repeating field checks. Status codes
asserted include `201` on create, `422` on validation, `409` on an illegal transition, and `200`
on the remaining reads/actions.

**Defect pipeline.** The manual session in `docs/DEFECT_LOG.md` found 11 defects. Each followed
the same path: reproduce against the running app → assign an `ADQA-###` ID and severity → write a
named failing Cypress test (or use the failing resilience test) → fix the app → rerun to green →
link the test file:line back into the defect log and the defect ID into the test name. The
traceability matrix in `docs/TEST_PLAN.md` maps every business rule and every defect to its
covering tests.

**CI.** The workflow runs `typecheck-and-unit` (coverage summary to the step summary), `smoke`,
then two regression shards. Videos and failure screenshots are uploaded on failure; JUnit and
JSON reports are always uploaded. The `triage` job runs with `if: always()`, downloads the
reports, and appends the Markdown summary below to `$GITHUB_STEP_SUMMARY`.

## Results

All figures below were produced by commands run in this build on 2026-11-05. No estimates.

| Measure | Result |
| --- | --- |
| Cypress specs | **7** |
| Cypress tests | **34** |
| Smoke tests | **4** |
| Regression tests | **30** |
| Full-suite runtime (Cypress summary) | **53s** (clean triage run); three consecutive runs: 50s, 49s, 62s |
| Smoke-suite runtime (Cypress summary) | **8s** |
| Pass rate across 3 consecutive full runs | **100% (102/102 tests)** |
| Flakes across 3 full runs | **0** |
| Domain unit tests | **22** |
| Domain statement coverage | **100% (280/280)** |
| Domain branch coverage | **98.95% (95/96)** |
| Domain function coverage | **100% (19/19)** |
| Domain line coverage | **100% (280/280)** |
| Defects found by exploratory testing | **11** |
| Severity breakdown | **1 Critical · 4 High · 5 Medium · 1 Low** |
| Defects covered by named regression tests | **11 / 11** |
| REST endpoints with contract assertions | **11** |
| Simulated UI failure modes | **4** (create 500, screens network error, publish 409, delayed response/loading) |

### Defect coverage

| ID | Severity | Regression test | File |
| --- | --- | --- | --- |
| ADQA-001 | High | rejects a negative daily flight budget | `cypress/e2e/defect-regressions.cy.ts:18` |
| ADQA-002 | Medium | accepts a same-day flight | `cypress/e2e/defect-regressions.cy.ts:36` |
| ADQA-003 | Medium | accepts adjacent, non-overlapping flights on one screen | `cypress/e2e/defect-regressions.cy.ts:54` |
| ADQA-004 | Low | rejects a 300-character campaign name | `cypress/e2e/defect-regressions.cy.ts:77` |
| ADQA-005 | High | double-clicking create sends exactly one POST | `cypress/e2e/defect-regressions.cy.ts:90` |
| ADQA-006 | High | refuses to delete a flight after approval or publish | `cypress/e2e/defect-regressions.cy.ts:120` |
| ADQA-007 | Medium | shows cent-accurate flight costs and totals | `cypress/e2e/defect-regressions.cy.ts:143` |
| ADQA-008 | Medium | retryable error banner on create 500 | `cypress/e2e/resilience.cy.ts:15` |
| ADQA-009 | High | screens empty state with retry | `cypress/e2e/resilience.cy.ts:43` |
| ADQA-010 | Medium | conflict message on publish 409 | `cypress/e2e/resilience.cy.ts:73` |
| ADQA-011 | Critical | reviewer cannot approve their own campaign | `cypress/e2e/defect-regressions.cy.ts:166` |

Full reproduction steps, expected vs. actual, root cause and affected component for each defect
are in **[docs/DEFECT_LOG.md](docs/DEFECT_LOG.md)**.

### Triage summary

Real output of `npm run triage -- cypress/reports` from the clean 53s full-suite run:

```markdown
## Cypress test triage

| Metric | Value |
| --- | --- |
| Total tests | 34 |
| Passed | 34 |
| Failed | 0 |
| Skipped / pending | 0 |
| Pass rate | 100.00% |
| Specs | 7 |
| Total duration | 53.65s |

### Slowest 5 specs

| Spec | Tests | Duration | Pass rate |
| --- | ---: | ---: | ---: |
| cypress/e2e/defect-regressions.cy.ts | 8 | 18.22s | 100.00% |
| cypress/e2e/campaign-create.cy.ts | 4 | 8.45s | 100.00% |
| cypress/e2e/flight-scheduling.cy.ts | 4 | 7.64s | 100.00% |
| cypress/e2e/api-contract.cy.ts | 6 | 6.70s | 100.00% |
| cypress/e2e/resilience.cy.ts | 4 | 5.45s | 100.00% |

### Per-spec pass rate

| Spec | Passed | Failed | Skipped | Pass rate |
| --- | ---: | ---: | ---: | ---: |
| cypress/e2e/api-contract.cy.ts | 6 | 0 | 0 | 100.00% |
| cypress/e2e/approval-workflow.cy.ts | 7 | 0 | 0 | 100.00% |
| cypress/e2e/campaign-create.cy.ts | 4 | 0 | 0 | 100.00% |
| cypress/e2e/defect-regressions.cy.ts | 8 | 0 | 0 | 100.00% |
| cypress/e2e/end-to-end-publish.cy.ts | 1 | 0 | 0 | 100.00% |
| cypress/e2e/flight-scheduling.cy.ts | 4 | 0 | 0 | 100.00% |
| cypress/e2e/resilience.cy.ts | 4 | 0 | 0 | 100.00% |

### Failures by spec

_No failures in this run._
```

### Reproduce the numbers

```bash
npm run test:unit -- --coverage     # unit count + coverage table
npm run test:e2e                    # 34 tests, full-suite runtime
npm run test:smoke                  # 4 smoke tests and runtime
npm run triage -- cypress/reports   # triage table from the latest run
```

## Documentation

- [Defect log](docs/DEFECT_LOG.md) — 11 explored defects, reproduction, root cause, fix, linked test.
- [Test plan](docs/TEST_PLAN.md) — scope, risk priorities, smoke/regression rationale, traceability.
- [Contributing](CONTRIBUTING.md) — adding a spec with the page-object pattern.

## License

[MIT](LICENSE)
