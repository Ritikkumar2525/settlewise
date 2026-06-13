import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { migrate, seedDefaults } from "./schema.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const defaultDbPath = path.join(rootDir, "data", "shared-expenses.sqlite");

export function openDatabase(options = {}) {
  const dbPath = options.memory ? ":memory:" : process.env.DB_PATH || defaultDbPath;
  if (dbPath !== ":memory:") fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA foreign_keys = ON");
  migrate(db);
  seedDefaults(db);
  return db;
}
