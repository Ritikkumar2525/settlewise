# Decision Log

## Use SQLite through Node's built-in module

Options considered: PostgreSQL, MySQL, SQLite with native package, Node built-in SQLite.

Choice: Node built-in SQLite.

Why: The assignment requires a relational database. SQLite keeps local setup small and still gives real tables, foreign keys, and SQL. Using Node's built-in module avoids native npm packages that can fail during review setup.

## Store money as integer minor units

Options considered: floats, decimal strings, integer paise/cents.

Choice: integer minor units.

Why: Balance math and split allocation need deterministic rounding. Display converts integers back to formatted INR amounts.

## Convert all balances to INR

Options considered: multi-currency balances, convert on display, convert at import/create time.

Choice: store original currency and amount, plus normalized INR base amount.

Why: Priya's USD concern is handled without losing source data. Balance calculations use one currency, while trace rows still show the original currency.

## Default missing USD rate to 83 INR/USD with warning

Options considered: block all missing FX rows, treat USD as INR, use live FX API, use documented fixed rate.

Choice: fixed default with `FX_RATE_DEFAULTED`.

Why: Treating USD as INR is wrong and live FX would make historical imports nondeterministic. A fixed documented rate is auditable and easy to change live.

## Enforce membership windows

Options considered: split among current members, split among all historical members, split among active members on expense date.

Choice: active members on expense date.

Why: Sam should not owe March costs, and Meera should not owe after moving out unless explicitly corrected in membership data.

## Import settlements as payments

Options considered: leave settlement rows as expenses, delete them, convert them to payments.

Choice: convert settlement-like rows to payments.

Why: A repayment reduces existing debts. Recording it as an expense creates new debt and distorts balances.

## Review duplicates instead of deleting

Options considered: import all duplicates, delete duplicate rows, skip duplicate rows with review status.

Choice: skip exact duplicates with `pending_approval`; block conflicting near-duplicates.

Why: Meera asked to approve anything changed or removed. The app never deletes source rows silently; it records the skipped action and waits for approval.

## Use a greedy settlement simplifier

Options considered: show only per-person balances, show all pairwise debts, simplify debtors to creditors greedily.

Choice: greedy debtor-creditor settlement plan.

Why: Aisha asked for one clear pay-whom answer. Greedy settlement is easy to explain by hand and produces minimal practical transfers for this group size.
