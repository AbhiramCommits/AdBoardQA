# Contributing to AdBoardQA

## Setup

```bash
npm install
npm run dev
```

The API listens on `http://localhost:3001`; the Vite UI listens on `http://localhost:5173`.
`POST /api/test/reset` restores the deterministic seed (6 screens, 4 campaigns).

## Ground rules

- TypeScript strict mode is enforced (`strict` + `noUncheckedIndexedAccess`). `npm run typecheck`
  must pass.
- `npm run lint` must be clean. Format with `npx prettier --write .`.
- No `cy.wait(milliseconds)`. Wait on an intercept alias or a retry-able assertion.
- Every `it()` carries `{ tags: ['@smoke'] }`, `{ tags: ['@regression'] }`, or both only when the
  test genuinely belongs in both gates. Prefer one tag so suite counts stay unambiguous.
- Specs never contain raw selectors. Add or extend a page object in
  `cypress/support/pages/` instead.
- Every exploratory defect must have a named regression test beginning with its `ADQA-###` ID.

## Adding a spec with the page-object pattern

1. **Extend the page object** with the intent-level action or assertion you need. All
   `data-cy` selectors stay in `cypress/support/pages/<Page>.ts`.

   ```ts
   // cypress/support/pages/FlightSchedulerPage.ts
   expectBlendedCpm(amount: string): this {
     cy.get('[data-cy="average-cpm"]').should('have.text', amount);
     return this;
   }
   ```

2. **Add typed fixtures or custom commands** if the setup needs data. Reuse
   `cy.resetDb()` plus `cy.seedCampaign()`; do not depend on data left by another test.

   ```ts
   cy.seedCampaign({ name: 'Autumn Push', budgetCents: 1_500_000 }).then((campaign) => {
     cy.apiAddFlight(campaign.id, {
       screenId: 'scr_mall_01',
       startDate: '2026-09-02',
       endDate: '2026-09-08',
       dailyBudgetCents: 25000,
     });
   });
   ```

3. **Write the spec** so it reads like the business journey. Import page objects, never
   `cy.get`.

   ```ts
   import { flightSchedulerPage } from '../support/pages/FlightSchedulerPage';

   describe('Blended CPM', () => {
     it(
       'reports the blended CPM for a single-screen plan',
       { tags: ['@regression'] },
       () => {
         cy.resetDb();
         cy.seedCampaign().then((campaign) => {
           flightSchedulerPage
             .visit(campaign.id)
             .addFlight({
               screenId: 'scr_airport_01',
               startDate: '2026-08-03',
               endDate: '2026-08-05',
               dailyBudgetDollars: '450',
             })
             .expectBlendedCpm('$10.71');
         });
       },
     );
   });
   ```

4. **Run it**:

   ```bash
   npx cypress run --spec cypress/e2e/your-spec.cy.ts
   npm run test:e2e
   ```

5. **Update the traceability matrix** in `docs/TEST_PLAN.md` if you are covering a new business
   rule, and update the defect log if the spec locks down an `ADQA` defect.

## Defect workflow

1. Reproduce against the running app and capture the actual response/UI state.
2. Add a row to `docs/DEFECT_LOG.md` with ID, severity, steps, expected vs. actual, root cause and
   affected component.
3. Write the failing named test first: `it('ADQA-012: …', { tags: ['@regression'] }, …)`.
4. Fix the app, rerun the test to green, and put the test file:line back into the defect log.

## Commits

Use conventional commits (`feat:`, `test:`, `ci:`, `docs:`, `fix:`). Keep the app, tests, and
docs for one logical change in the same commit; do not mix unrelated defects.

## Docker

```bash
docker compose up api web
docker compose --profile test up --abort-on-container-exit
```
