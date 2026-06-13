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

The latest 2026 dataset has been extracted and stored as `fixtures/expenses_export.csv`.

To automatically clear the database, seed it, ingest the new CSV data, and produce a detailed anomaly report, run:

```bash
node scripts/import_csv.js
```

This will parse the file, detect anomalies (like typos, missing currencies, and percentage mismatches), create expenses/payments, and output an `import_report.json` in the root directory.

## AI Used

Built with OpenAI Codex as the development collaborator. Details are in `AI_USAGE.md`.

## Deployment

This repository is ready for a Node-capable host. Set `PORT` if your platform provides one, run `npm run build`, then start with `npm run preview`.

I cannot create a public deployment URL or GitHub remote from this local workspace without deployment credentials.
