# Scope, Import Policy, and Schema

## Current Scope

The app supports:

- Login with persisted sessions
- Groups
- Membership windows with join and leave dates
- Expense creation and voiding
- Equal, exact, percent, and share split types
- Payments/settlements
- Group balance summaries
- Member-level trace rows for each balance
- CSV import with stored import reports and anomaly review statuses

## CSV Availability

`expenses_export.csv` was not present in the workspace. The importer is implemented against flexible header aliases and tested with `fixtures/sample_expenses_export.csv`, which intentionally covers the data problems described in the assignment.

## Anomaly Policies

| Code | Detection | Policy | Action |
| --- | --- | --- | --- |
| `EMPTY_FILE` | No header row | Cannot map safely | Stop import |
| `MISSING_REQUIRED_HEADERS` | Date, amount, or paid-by column cannot be identified | Required fields must be explicit or aliased | Stop import |
| `INVALID_DATE` | Date cannot be parsed | No dated ledger entry can be created | Block row |
| `AMBIGUOUS_DATE` | Date uses ambiguous or incomplete format | Parse with Indian day-first convention and log | Import with normalized date |
| `INVALID_AMOUNT` | Amount is not numeric after currency cleanup | No amount is guessed | Block row |
| `FX_RATE_DEFAULTED` | USD row lacks exchange rate | USD is never treated as INR; default to 83 INR/USD | Import with warning |
| `MISSING_DESCRIPTION` | Description is blank | Create traceable untitled row | Import with generated description |
| `SETTLEMENT_AS_PAYMENT` | Type or description indicates repayment/settlement | Settlements reduce balances and do not create owed shares | Import as payment |
| `PAYMENT_FROM_UNKNOWN` | Settlement sender cannot be resolved | Payment direction must be explicit | Block row |
| `PAYMENT_TO_UNKNOWN` | Settlement receiver cannot be resolved | Payment direction must be explicit | Block row |
| `PAYMENT_SELF_TRANSFER` | Sender and receiver are same member | Self-payments do not affect balances | Block row |
| `NEGATIVE_PAYMENT_NORMALIZED` | Payment amount is negative | Direction lives in from/to fields; amount is stored positive | Import as positive payment |
| `UNKNOWN_PAYER` | Paid-by name does not match a group member | Unknown payers are likely typos | Block row |
| `PAYER_NOT_ACTIVE` | Payer is outside membership window | Membership windows are enforced | Block row |
| `NEGATIVE_REFUND` | Negative amount with refund/reversal wording | Refund rows reverse expense impact | Import as negative expense |
| `NEGATIVE_AMOUNT_REVIEW` | Negative amount without refund wording | Preserve as reversing expense but surface it | Import with warning |
| `SPLIT_TYPE_DEFAULTED` | Missing split type | Default only to equal when participants are known | Import as equal split |
| `IMPLIED_ACTIVE_MEMBERS` | Equal split has no participants | Use active members on the expense date | Import with warning |
| `ALL_PARTICIPANTS_BY_MEMBERSHIP` | Participants say all/everyone/active | Expand by membership windows, not current members | Import with warning |
| `UNKNOWN_PARTICIPANT` | Participant name cannot be resolved | Typos must not silently change balances | Block row |
| `NO_PARTICIPANTS` | No participant list and cannot infer active members | No split can be calculated | Block row |
| `PARTICIPANT_NOT_ACTIVE` | Explicit participant is outside membership window | Membership windows are enforced | Block row |
| `MISSING_SPLIT_VALUES` | Exact/percent/share split lacks values | Custom splits require values per member | Block row |
| `UNKNOWN_SPLIT_MEMBER` | Custom split value references unknown member | Typos must not silently create balances | Block row |
| `SPLIT_PARTICIPANTS_FROM_VALUES` | Participant list differs from value map | Value map is authoritative for custom split rows | Import with warning |
| `EXACT_SPLIT_TOTAL_MISMATCH` | Exact split total differs from expense by more than INR 1 | App does not choose a winning amount | Block row |
| `ROUNDING_ADJUSTED` | Exact split differs by INR 1 or less | Assign small rounding delta to final split member | Import with warning |
| `PERCENT_TOTAL_MISMATCH` | Percent split does not total 100 | Percent rows must be mathematically complete | Block row |
| `INVALID_SHARE_WEIGHT` | Share split contains zero, negative, or nonnumeric weight | Shares must be positive | Block row |
| `UNSUPPORTED_SPLIT_TYPE` | Split type is unknown | A policy must be added before importing | Block row |
| `DUPLICATE_EXACT` | Row hash or natural expense key already exists | Do not import twice; leave review trail | Skip with pending approval |
| `DUPLICATE_CONFLICT` | Same date/payer/description but different amount | No row wins automatically | Block with pending approval |
| `DUPLICATE_PAYMENT` | Payment row already imported | Do not reduce debt twice | Skip with pending approval |

## Database Schema

### `users`

Login identities. Passwords use `scrypt` with a per-user salt.

### `sessions`

Bearer tokens with expiration.

### `groups`

Expense groups. Each group has a base currency, currently `INR`.

### `members`

People who can participate in expenses.

### `group_memberships`

Join/leave windows. Balance import logic uses these windows when expanding `All` and when validating explicit participants.

### `expenses`

Original expense amount/currency plus normalized base INR amount, payer, split type, import source metadata, and status.

### `expense_splits`

Member-level owed amount per expense. Exact, percent, and share metadata is stored when available.

### `payments`

Settlements from one member to another. Payments affect balances but do not create expense shares.

### `imports`

One row per uploaded CSV file, including a JSON summary.

### `import_rows`

One row per CSV data row with raw JSON and action taken.

### `import_anomalies`

Every detected issue, policy, action, raw row, and review status.
