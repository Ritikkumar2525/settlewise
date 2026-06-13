# AI Usage

AI collaborator: OpenAI Codex.

## Key Prompts

- Build a React and Node.js shared expenses app for the provided assignment.
- Use a relational database and implement the CSV import requirement deliberately.
- Add docs for anomaly policies, schema, decisions, and AI usage.

## Cases Where AI Output Needed Correction

1. It initially tried to inspect for files before confirming `expenses_export.csv` existed. I caught that the workspace had no CSV and changed the plan to build a robust upload importer plus a separate fixture.
2. It drafted a settlement button that tried to infer the group id from the DOM. I caught that this would fail at runtime and changed it to pass `groupId` explicitly through React props.
3. It wrote fixture rows with shifted CSV columns. I caught the extra commas before relying on the fixture and corrected the sample file so tests exercise intended anomalies.
4. It almost allowed unknown participant names to be filtered out. I caught that this would silently change balances and changed unknown participants into blocking `UNKNOWN_PARTICIPANT` anomalies.

## Engineer-of-Record Notes

Every import policy in `SCOPE.md` maps to code in `server/importer.js`. Balance calculation is in `server/balances.js`. The UI only displays results from the API; it does not perform hidden balance math.
