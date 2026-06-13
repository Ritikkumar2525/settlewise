# SCOPE: SettleWise Shared Expenses

## What was built
SettleWise is a modern web application for tracking and splitting shared expenses. The application was built from the ground up to replace a complex Google Sheet, addressing data integrity issues, tracking active memberships, and correctly parsing varied currency formats. We recently completed a major update to migrate the platform to a dark-mode premium UI, and ingested the latest 2026 expense dataset, resolving several edge cases along the way.

## Data Anomalies & Fixes

During the import of `expenses_export.csv`, the application encountered several data anomalies. Here is how they were detected and handled:

1. **Thousands Separator Typo (`1.200`)**:
   - **Problem**: In the "Electricity Feb" row, the amount was entered as `1.200` instead of `1,200`. Standard parsers convert this to `1.2` INR.
   - **Resolution**: Enhanced `money.js` to detect a dot followed by exactly three zeros when parsing amounts. It now automatically corrects `1.200` to `1200` and the importer logs a `THOUSANDS_SEPARATOR_TYPO` warning.
2. **Missing Currency**:
   - **Problem**: The "Groceries DMart" row on 15/03/2026 had no currency specified.
   - **Resolution**: The importer defaults the currency to the group's base currency (INR) and now logs a `MISSING_CURRENCY` warning to ensure users are aware of the fallback.
3. **Payer Alias (`Priya S` vs `Priya`)**:
   - **Problem**: The name "Priya S" was used in one row, but her official member name was "Priya". This would block the row as an unknown payer.
   - **Resolution**: Updated the `normalizePerson` utility in `server/csv.js` to alias "priya s" to "priya", allowing the row to map correctly to the existing member.
4. **Fractional Amounts (`899.995`)**:
   - **Problem**: "Cylinder refill" had an amount of `899.995`.
   - **Resolution**: The `toMinor` conversion correctly applies `Math.round(899.995 * 100)`, safely storing the value as `900.00` INR without causing precision loss.
5. **Membership Windows & Excluded Members**:
   - **Problem**: Meera moved out on March 31, 2026, and Sam moved in on April 1, 2026. However, Meera was still mistakenly included in the April "Groceries BigBasket" row.
   - **Resolution**: The importer automatically blocks rows that explicitly include inactive members during a transaction date, raising a `PARTICIPANT_NOT_ACTIVE` error. This forces a manual correction so debts aren't assigned to former roommates.
6. **Ambiguous Dates (`04/05/2026`)**:
   - **Problem**: A row listed `04/05/2026` with a note "is this April 5 or May 4?". 
   - **Resolution**: Our date parser checks standard Indian date formats (DD/MM/YYYY) first, but flags an `AMBIGUOUS_DATE` warning to draw attention to potential month/day swaps.
7. **Negative Refund (`-30` USD)**:
   - **Problem**: A refund was logged for a parasailing cancellation.
   - **Resolution**: The importer warns with `NEGATIVE_REFUND` but preserves the logic, reversing the payer and owed amounts.
8. **Invalid Percentages (`Aisha 30%; Rohan 30%; Priya 30%; Meera 20%`)**:
   - **Problem**: "Weekend brunch" was split with percentages totaling 110%.
   - **Resolution**: The importer catches this and emits a `PERCENT_TOTAL_MISMATCH` error, blocking the row until the math is fixed.
9. **Missing Payer**:
   - **Problem**: "House cleaning supplies" had an empty `paid_by` field.
   - **Resolution**: The importer emits an `UNKNOWN_PAYER` error and blocks the row since it cannot assign the debt effectively without a payer.
10. **Duplicate Detection**:
    - **Problem**: "Dinner at Marina Bites" was logged twice with slightly different casing ("Dinner at Marina Bites" vs "dinner - marina bites").
    - **Resolution**: The importer computes natural keys based on the date, amount, payer, and participants, successfully flagging `DUPLICATE_EXACT` and skipping the duplicate entry.

## Database Schema Highlights
The database uses a normalized SQLite schema:
- **`users` & `sessions`**: Handle authentication and session management.
- **`groups` & `members`**: A group contains multiple members. `group_memberships` tracks the crucial `joined_on` and `left_on` dates to enforce active member windows.
- **`expenses` & `expense_splits`**: Expenses are stored in minor units (`amount_minor`) alongside their currency to avoid floating point issues. Splits describe how the amount is divided among members.
- **`payments`**: Captures settlements directly between members.
- **`imports`, `import_rows`, `import_anomalies`**: Track the lifecycle of a CSV file. Each row is logged, and anomalies (warnings/errors) are stored with their respective resolution status.

This strict data model prevents invalid states (like assigning expenses to inactive members) and provides an audit trail for every CSV import.
