# Decision Log

## Architecture & Data Modeling

1. **Monetary Values Stored in Minor Units**
   - **Decision**: All financial amounts are stored as integers in minor units (e.g., paisa for INR, cents for USD) rather than floating point numbers.
   - **Rationale**: Floating point arithmetic causes precision issues (e.g., `0.1 + 0.2 = 0.30000000000000004`). By converting `899.995` to `900.00` via `Math.round()` prior to storage, we ensure consistent mathematical operations when allocating splits and settling balances.

2. **Membership Windows vs. Soft Deletes**
   - **Decision**: Members are tracked via `joined_on` and `left_on` dates in a `group_memberships` table, rather than simple active/inactive booleans or soft deletes.
   - **Rationale**: Group dynamics change over time (e.g., Meera moved out on March 31, and Sam moved in on April 1). Storing date windows allows the system to accurately determine who should be included in an "equal split" on any given day. If an expense is logged on April 2, Meera is automatically excluded, preventing unfair debt assignment.

3. **CSV Ingestion as an Audit Trail**
   - **Decision**: The CSV import process does not immediately blindly inject expenses into the database. It stores the file, tracks each row via `import_rows`, and records any issues in `import_anomalies`.
   - **Rationale**: Spreadsheet data is notoriously messy. Treating ingestion as an asynchronous validation pipeline allows users to review blocked rows, approve edge cases, and manually fix data typos without corrupting the core database.

4. **Strict Split Validation**
   - **Decision**: If an unequal split calculation is off by more than a minimal rounding threshold, the row is blocked rather than silently corrected.
   - **Rationale**: In the "Weekend brunch" example where percentages totaled 110%, guessing the intended split is dangerous. Failing fast ensures the user corrects the source of truth, maintaining trust in the platform.

5. **Heuristic Typo Correction for Amounts**
   - **Decision**: Implemented an explicit check to convert `1.200` to `1200` for INR when it looks like a European-style thousands separator.
   - **Rationale**: It's a common typo that severely distorts balances if left unchecked. However, since we correct it automatically, we also emit a `THOUSANDS_SEPARATOR_TYPO` warning so the user is aware of the manipulation.
