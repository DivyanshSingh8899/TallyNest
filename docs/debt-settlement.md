# Smart Debt Settlement

## Balance and currency model

Settlement uses the imported member net balance for one selected currency. A positive balance is money to receive; a negative balance is money to pay. Currencies are solved independently and are never combined using the dashboard's estimated exchange rates. Amounts are rounded to the minor unit defined by `Intl.NumberFormat` for the currency before planning. A group whose rounded balances do not sum to zero is rejected.

Unavailable routes are directional. Blocking `A → B` does not block `B → A`. The page does not support member-level transfer policies because the current data model has no such policy. Constraints and plans are held in page state only; generating a plan never updates or persists transactions, balances, or payments.

## Algorithm and guarantees

The engine operates on integer minor units and applies these stages:

1. Validate member balances, currency, maximum transfer amount, and route references, including duplicate and self routes.
2. Search debtor-to-creditor transfers with bounded backtracking. Each candidate moves the largest amount possible for the selected pair, subject to the remaining balances and per-transfer cap. Repeated transfers on the same route are allowed when the cap requires them. Memoized balance states and a 20,000-state limit bound the search.
3. When search finds a candidate, independently verify every transfer, route, cap, and final member balance before returning success.
4. If bounded search finds no candidate, use a bipartite max-flow check to distinguish route infeasibility from a search miss. A feasible flow is split into capped transactions and verified again. No partial plan is presented as success.

With no route restrictions and no transfer cap, the backtracking search is exhaustive when it stays below its state limit. In that case it returns a proven minimum transaction count. With route restrictions or a cap, the search is a heuristic: it does not enumerate every possible partial amount or solve the fixed-charge network-flow problem globally. A valid constrained plan is labelled heuristic even if it happens to be optimal. If the state budget is exhausted, the max-flow fallback establishes feasibility, not minimum transaction count. Infeasible means no complete transfer flow can satisfy the available directed routes; cap splitting itself does not make an otherwise feasible route flow infeasible because multiple transfers are allowed.

## Tests

Run all automated tests with:

```sh
npm test
```

The settlement tests cover direct debts, multiple members, transfer caps, unavailable routes, infeasibility, zero balances, malformed input, currency precision, and conservation of each member's net balance.

## Software metrics

No code-metrics tool is configured as an application dependency. To measure the settlement module without adding runtime dependencies:

- LOC: `wc -l src/utils/debtSettlement.ts` (and include the test file separately if desired).
- Cyclomatic complexity, Halstead volume/difficulty/effort, maintainability index, CBO, and class-level metrics: import the TypeScript project into a static-analysis tool with TypeScript support (for example, SciTools Understand) and generate a metrics report scoped to `src/utils/debtSettlement.ts`.
- WMC, DIT, and NOC are not applicable to the settlement engine because it uses standalone functions and no inheritance. CBO should be reported at the module level; the engine has no imports from application modules.
- The engine is intentionally split into validation, minor-unit conversion, candidate search, max-flow feasibility, cap splitting, and final verification functions so complexity can be reported per decision surface rather than hidden in a UI component.
