import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { importExpensesCsv } from "../server/importer.js";
import { openDatabase } from "../server/db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// We'll use the default db logic which sets up DB and seeds it.
const defaultDbPath = path.join(__dirname, "..", "data", "shared-expenses.sqlite");
if (fs.existsSync(defaultDbPath)) {
  fs.unlinkSync(defaultDbPath);
}

const db = openDatabase();

const group = db.prepare("SELECT id FROM groups WHERE name = ?").get("Flatmates");
const user = db.prepare("SELECT id FROM users WHERE email = ?").get("aisha@example.com");

const csvPath = path.join(__dirname, "..", "fixtures", "expenses_export.csv");
const csvText = fs.readFileSync(csvPath, "utf8");

console.log("Ingesting CSV...");
const report = importExpensesCsv(db, {
  groupId: group.id,
  userId: user.id,
  fileName: "expenses_export.csv",
  csvText
});

const reportPath = path.join(__dirname, "..", "import_report.json");
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

console.log(`Import finished! Found ${report.summary.anomalies} anomalies.`);
console.log(`Report written to ${reportPath}`);
