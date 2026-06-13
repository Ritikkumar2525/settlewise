# Shared Expenses App

React + Node.js app for importing a messy flatmate expense CSV, surfacing data anomalies, calculating balances, and recording settlements.

## Stack

- React 19 + Vite
- Node.js native HTTP server
- SQLite via Node's built-in `node:sqlite` module
- Relational database persisted at `data/shared-expenses.sqlite`

## Setup

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:5173`.

Seed login:

- Email: `aisha@example.com`
- Password: `password123`

Run tests:

```bash
npm test
```

Build for production:

```bash
npm run build
npm run preview
```

`preview` serves the built React app and API from `http://127.0.0.1:3001`.

## Importing `expenses_export.csv`

Use the Import tab and upload the CSV exactly as received. The importer parses the file, creates expenses/payments where safe, blocks unsafe rows, and writes a report to the `imports`, `import_rows`, and `import_anomalies` tables.

The assignment CSV was not present in this workspace, so `fixtures/sample_expenses_export.csv` is included only as a repeatable test fixture. It is not required by the app and does not replace the assignment file.

## AI Used

Built with OpenAI Codex as the development collaborator. Details are in `AI_USAGE.md`.

## Deployment

This repository is ready for a Node-capable host. Set `PORT` if your platform provides one, run `npm run build`, then start with `npm run preview`.

I cannot create a public deployment URL or GitHub remote from this local workspace without deployment credentials.
