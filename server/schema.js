import { hashPassword } from "./security.js";

export function migrate(db) {
  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      base_currency TEXT NOT NULL DEFAULT 'INR',
      created_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      display_name TEXT NOT NULL UNIQUE,
      email TEXT
    );

    CREATE TABLE IF NOT EXISTS group_memberships (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      joined_on TEXT NOT NULL,
      left_on TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      expense_date TEXT NOT NULL,
      description TEXT NOT NULL,
      amount_minor INTEGER NOT NULL,
      currency TEXT NOT NULL,
      exchange_rate REAL NOT NULL,
      base_amount_minor INTEGER NOT NULL,
      paid_by_member_id INTEGER NOT NULL REFERENCES members(id),
      split_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'posted',
      source_row_hash TEXT,
      source_file TEXT,
      notes TEXT,
      created_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS expense_splits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      expense_id INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
      member_id INTEGER NOT NULL REFERENCES members(id),
      owed_minor INTEGER NOT NULL,
      raw_value TEXT,
      share_weight REAL,
      percent REAL
    );

    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      payment_date TEXT NOT NULL,
      from_member_id INTEGER NOT NULL REFERENCES members(id),
      to_member_id INTEGER NOT NULL REFERENCES members(id),
      amount_minor INTEGER NOT NULL,
      currency TEXT NOT NULL,
      exchange_rate REAL NOT NULL,
      base_amount_minor INTEGER NOT NULL,
      notes TEXT,
      source_row_hash TEXT,
      source_file TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS imports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      file_name TEXT NOT NULL,
      status TEXT NOT NULL,
      created_by INTEGER REFERENCES users(id),
      summary_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS import_rows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      import_id INTEGER NOT NULL REFERENCES imports(id) ON DELETE CASCADE,
      row_number INTEGER NOT NULL,
      row_hash TEXT NOT NULL,
      action TEXT NOT NULL,
      expense_id INTEGER REFERENCES expenses(id),
      payment_id INTEGER REFERENCES payments(id),
      raw_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS import_anomalies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      import_id INTEGER NOT NULL REFERENCES imports(id) ON DELETE CASCADE,
      row_number INTEGER,
      severity TEXT NOT NULL,
      code TEXT NOT NULL,
      message TEXT NOT NULL,
      policy TEXT NOT NULL,
      action TEXT NOT NULL,
      raw_json TEXT,
      resolution_status TEXT NOT NULL DEFAULT 'auto_applied',
      proposed_patch_json TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

export function seedDefaults(db) {
  const userCount = db.prepare("SELECT COUNT(*) AS count FROM users").get().count;
  if (userCount === 0) {
    const { hash, salt } = hashPassword("password123");
    db.prepare(
      "INSERT INTO users (name, email, password_hash, password_salt) VALUES (?, ?, ?, ?)"
    ).run("Aisha", "aisha@example.com", hash, salt);
  }

  const groupCount = db.prepare("SELECT COUNT(*) AS count FROM groups").get().count;
  if (groupCount === 0) {
    const user = db.prepare("SELECT id FROM users WHERE email = ?").get("aisha@example.com");
    db.prepare("INSERT INTO groups (name, base_currency, created_by) VALUES (?, ?, ?)").run(
      "Flatmates",
      "INR",
      user.id
    );
  }

  const group = db.prepare("SELECT id FROM groups WHERE name = ?").get("Flatmates");
  const people = [
    ["Aisha", "2026-02-01", null],
    ["Rohan", "2026-02-01", null],
    ["Priya", "2026-02-01", null],
    ["Meera", "2026-02-01", "2026-03-31"],
    ["Dev", "2026-02-01", "2026-03-31"],
    ["Sam", "2026-04-01", null]
  ];

  for (const [name, joinedOn, leftOn] of people) {
    let member = db.prepare("SELECT id FROM members WHERE display_name = ?").get(name);
    if (!member) {
      const result = db.prepare("INSERT INTO members (display_name) VALUES (?)").run(name);
      member = { id: Number(result.lastInsertRowid) };
    }
    const membership = db
      .prepare("SELECT id FROM group_memberships WHERE group_id = ? AND member_id = ?")
      .get(group.id, member.id);
    if (!membership) {
      db.prepare(
        "INSERT INTO group_memberships (group_id, member_id, joined_on, left_on) VALUES (?, ?, ?, ?)"
      ).run(group.id, member.id, joinedOn, leftOn);
    }
  }
}
