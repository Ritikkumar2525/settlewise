import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { getGroupBalances } from "./balances.js";
import { openDatabase } from "./db.js";
import { importExpensesCsv } from "./importer.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

test("CSV import reports deliberate anomalies and imports valid ledger rows", () => {
  const db = openDatabase({ memory: true });
  const group = db.prepare("SELECT id FROM groups WHERE name = ?").get("Flatmates");
  const user = db.prepare("SELECT id FROM users WHERE email = ?").get("aisha@example.com");
  const csvText = fs.readFileSync(path.join(rootDir, "fixtures", "sample_expenses_export.csv"), "utf8");

  const report = importExpensesCsv(db, {
    groupId: group.id,
    userId: user.id,
    fileName: "sample_expenses_export.csv",
    csvText
  });

  const codes = new Set(report.anomalies.map((anomaly) => anomaly.code));
  for (const code of [
    "DUPLICATE_EXACT",
    "FX_RATE_DEFAULTED",
    "PAYER_NOT_ACTIVE",
    "EXACT_SPLIT_TOTAL_MISMATCH",
    "NEGATIVE_AMOUNT_REVIEW",
    "NEGATIVE_REFUND",
    "SETTLEMENT_AS_PAYMENT",
    "INVALID_DATE",
    "UNKNOWN_PAYER",
    "PERCENT_TOTAL_MISMATCH",
    "UNSUPPORTED_SPLIT_TYPE",
    "AMBIGUOUS_DATE"
  ]) {
    assert.equal(codes.has(code), true, `expected anomaly ${code}`);
  }

  assert.equal(report.summary.rowsSeen, 15);
  assert.equal(report.summary.paymentsImported, 1);
  assert.equal(report.summary.rowsSkipped, 1);
  assert.equal(report.summary.rowsBlocked >= 6, true);

  const balances = getGroupBalances(db, group.id);
  assert.equal(Array.isArray(balances.settlements), true);
  assert.equal(balances.members.some((member) => member.display_name === "Sam" && member.trace.every((entry) => !entry.description.includes("Electricity"))), true);
});
