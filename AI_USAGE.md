# AI Usage Log

## AI Tools Used
During the development of the SettleWise platform, several AI coding assistants and generation tools were leveraged to expedite development:
- **Code Assistants**: Antigravity/Gemini code models were heavily utilized for pair-programming, writing styling updates, layout restructuring, and writing the robust ingestion pipeline logic.
- **Image Generation**: Generative AI tools were used during the UI redesign phase to mock up modern UI patterns (like the premium dark theme) and establish the initial visual aesthetic.

## 3 Concrete Cases Where AI Went Astray & How They Were Corrected

1. **Incorrect Tool Call Format During File Writing**:
   - **What Happened**: When writing the initial `fixtures/expenses_export.csv`, the AI assistant incorrectly attempted to attach `ArtifactMetadata` to a normal repository file. `ArtifactMetadata` is only supported for specific system artifacts and caused a tool execution crash.
   - **Correction**: The AI identified its mistake immediately and re-issued the `write_to_file` call without the invalid metadata, successfully creating the CSV in the correct directory.

2. **Failing to Identify the Correct SQLite Driver**:
   - **What Happened**: While writing `scripts/import_csv.js`, the AI generated code using `import Database from "better-sqlite3"`. Running the script caused a `ERR_MODULE_NOT_FOUND` crash because `better-sqlite3` wasn't in `package.json`.
   - **Correction**: The AI investigated the project's dependencies via `view_file` on `package.json` and `server/db.js`. It realized the platform uses the built-in Node 22+ `node:sqlite` API instead. The AI updated the script to import the existing `openDatabase` utility from `server/db.js`, which successfully fixed the crash.

3. **Generating Hardcoded Temporary UI Fixes**:
   - **What Happened**: During the layout phase for fixing the toggle switch clipping issue, an earlier iteration generated temporary CSS padding and static width constraints to "force" the toggle into place, rather than addressing the core layout flow issue (e.g., proper overflow handling and flexbox alignment).
   - **Correction**: The AI was prompted to stop making assumptions and strictly inspect the DOM hierarchy. It pivoted from hacky padding fixes to a proper structural redesign using CSS variables and dedicated overflow constraints for the split panels, yielding a much cleaner, production-ready dark mode UI.

## Key Prompts Used
- "Redesign the entire SettleWise Shared Expenses application into a premium, production-ready SaaS product. Transform it into a polished fintech-grade platform inspired by Linear, Stripe..."
- "Update the user data according to this spreadsheet screenshot, ensuring the CSV ingestion logic can catch missing fields, fractional amounts, and ambiguous dates."
- "Create an implementation plan detailing how you will update the schema membership dates to match the 2026 transaction windows."
