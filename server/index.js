import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getGroupBalances } from "./balances.js";
import { openDatabase } from "./db.js";
import { importExpensesCsv, getImportReport, updateAnomalyResolution } from "./importer.js";
import { allocateByWeights, allocateEvenly, baseMinorFrom, fromMinor, parseAmount } from "./money.js";
import { makeToken, verifyPassword } from "./security.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");
const db = openDatabase();
const port = Number(process.env.PORT || 3001);

const server = http.createServer(async (req, res) => {
  try {
    await handleRequest(req, res);
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { error: "Internal server error", detail: error.message });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`API listening on http://127.0.0.1:${port}`);
});

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (req.method === "OPTIONS") return sendEmpty(res, 204);

  if (url.pathname === "/api/health") {
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === "POST" && url.pathname === "/api/auth/login") {
    const body = await readJson(req);
    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(String(body.email || "").toLowerCase());
    if (!user || !verifyPassword(String(body.password || ""), user.password_salt, user.password_hash)) {
      return sendJson(res, 401, { error: "Invalid email or password" });
    }
    const token = makeToken();
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString();
    db.prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)").run(token, user.id, expiresAt);
    return sendJson(res, 200, { token, user: publicUser(user) });
  }

  const user = requireUser(req);
  if (!user) return sendJson(res, 401, { error: "Authentication required" });

  if (req.method === "GET" && url.pathname === "/api/me") {
    return sendJson(res, 200, { user: publicUser(user) });
  }

  if (req.method === "POST" && url.pathname === "/api/auth/logout") {
    const token = bearerToken(req);
    if (token) db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === "GET" && url.pathname === "/api/groups") {
    return sendJson(res, 200, { groups: listGroups() });
  }

  if (req.method === "POST" && url.pathname === "/api/groups") {
    const body = await readJson(req);
    const result = db.prepare("INSERT INTO groups (name, base_currency, created_by) VALUES (?, ?, ?)").run(
      String(body.name || "New group").trim(),
      "INR",
      user.id
    );
    return sendJson(res, 201, { group: getGroup(Number(result.lastInsertRowid)) });
  }

  let match = url.pathname.match(/^\/api\/groups\/(\d+)$/);
  if (match && req.method === "GET") {
    return sendJson(res, 200, { group: getGroup(Number(match[1])) });
  }

  if (match && req.method === "PATCH") {
    const groupId = Number(match[1]);
    const body = await readJson(req);
    db.prepare("UPDATE groups SET name = ? WHERE id = ?").run(String(body.name || "").trim(), groupId);
    return sendJson(res, 200, { group: getGroup(groupId) });
  }

  match = url.pathname.match(/^\/api\/groups\/(\d+)\/memberships$/);
  if (match && req.method === "POST") {
    const groupId = Number(match[1]);
    const body = await readJson(req);
    const member = upsertMember(String(body.displayName || "").trim());
    const result = db
      .prepare("INSERT INTO group_memberships (group_id, member_id, joined_on, left_on) VALUES (?, ?, ?, ?)")
      .run(groupId, member.id, body.joinedOn, body.leftOn || null);
    return sendJson(res, 201, { membership: getMembership(Number(result.lastInsertRowid)) });
  }

  match = url.pathname.match(/^\/api\/memberships\/(\d+)$/);
  if (match && req.method === "PATCH") {
    const body = await readJson(req);
    db.prepare("UPDATE group_memberships SET joined_on = ?, left_on = ? WHERE id = ?").run(
      body.joinedOn,
      body.leftOn || null,
      Number(match[1])
    );
    return sendJson(res, 200, { membership: getMembership(Number(match[1])) });
  }

  match = url.pathname.match(/^\/api\/groups\/(\d+)\/expenses$/);
  if (match && req.method === "GET") {
    return sendJson(res, 200, { expenses: listExpenses(Number(match[1])) });
  }

  if (match && req.method === "POST") {
    const expense = createExpense(Number(match[1]), user.id, await readJson(req));
    return sendJson(res, 201, { expense, balances: getGroupBalances(db, Number(match[1])) });
  }

  match = url.pathname.match(/^\/api\/expenses\/(\d+)$/);
  if (match && req.method === "PATCH") {
    const body = await readJson(req);
    db.prepare("UPDATE expenses SET status = ? WHERE id = ?").run(body.status === "void" ? "void" : "posted", Number(match[1]));
    return sendJson(res, 200, { expense: getExpense(Number(match[1])) });
  }

  match = url.pathname.match(/^\/api\/groups\/(\d+)\/payments$/);
  if (match && req.method === "GET") {
    return sendJson(res, 200, { payments: listPayments(Number(match[1])) });
  }

  if (match && req.method === "POST") {
    const payment = createPayment(Number(match[1]), await readJson(req));
    return sendJson(res, 201, { payment, balances: getGroupBalances(db, Number(match[1])) });
  }

  match = url.pathname.match(/^\/api\/groups\/(\d+)\/balances$/);
  if (match && req.method === "GET") {
    return sendJson(res, 200, getGroupBalances(db, Number(match[1])));
  }

  match = url.pathname.match(/^\/api\/groups\/(\d+)\/imports$/);
  if (match && req.method === "GET") {
    const imports = db
      .prepare("SELECT * FROM imports WHERE group_id = ? ORDER BY created_at DESC, id DESC")
      .all(Number(match[1]))
      .map((item) => ({ ...item, summary: JSON.parse(item.summary_json) }));
    return sendJson(res, 200, { imports });
  }

  if (match && req.method === "POST") {
    const body = await readJson(req, 5_000_000);
    const report = importExpensesCsv(db, {
      groupId: Number(match[1]),
      userId: user.id,
      fileName: body.fileName,
      csvText: body.csvText
    });
    return sendJson(res, 201, { report, balances: getGroupBalances(db, Number(match[1])) });
  }

  match = url.pathname.match(/^\/api\/imports\/(\d+)$/);
  if (match && req.method === "GET") {
    return sendJson(res, 200, { report: getImportReport(db, Number(match[1])) });
  }

  match = url.pathname.match(/^\/api\/import-anomalies\/(\d+)$/);
  if (match && req.method === "PATCH") {
    const body = await readJson(req);
    return sendJson(res, 200, { anomaly: updateAnomalyResolution(db, Number(match[1]), body.resolutionStatus) });
  }

  return serveStaticOr404(req, res, url);
}

function requireUser(req) {
  const token = bearerToken(req);
  if (!token) return null;
  const session = db
    .prepare(
      `SELECT s.*, u.id AS user_id, u.name, u.email
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token = ? AND s.expires_at > ?`
    )
    .get(token, new Date().toISOString());
  if (!session) return null;
  return { id: session.user_id, name: session.name, email: session.email };
}

function bearerToken(req) {
  const header = req.headers.authorization || "";
  return header.startsWith("Bearer ") ? header.slice(7) : "";
}

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email };
}

function listGroups() {
  return db
    .prepare(
      `SELECT g.*, COUNT(gm.id) AS member_count
       FROM groups g
       LEFT JOIN group_memberships gm ON gm.group_id = g.id
       GROUP BY g.id
       ORDER BY g.created_at`
    )
    .all();
}

function getGroup(groupId) {
  const group = db.prepare("SELECT * FROM groups WHERE id = ?").get(groupId);
  if (!group) return null;
  const memberships = db
    .prepare(
      `SELECT gm.*, m.display_name, m.email
       FROM group_memberships gm
       JOIN members m ON m.id = gm.member_id
       WHERE gm.group_id = ?
       ORDER BY gm.joined_on, m.display_name`
    )
    .all(groupId);
  return {
    ...group,
    memberships,
    balances: getGroupBalances(db, groupId)
  };
}

function upsertMember(displayName) {
  if (!displayName) throw new Error("Member name is required");
  const existing = db.prepare("SELECT * FROM members WHERE lower(display_name) = lower(?)").get(displayName);
  if (existing) return existing;
  const result = db.prepare("INSERT INTO members (display_name) VALUES (?)").run(displayName);
  return db.prepare("SELECT * FROM members WHERE id = ?").get(Number(result.lastInsertRowid));
}

function getMembership(id) {
  return db
    .prepare(
      `SELECT gm.*, m.display_name, m.email
       FROM group_memberships gm
       JOIN members m ON m.id = gm.member_id
       WHERE gm.id = ?`
    )
    .get(id);
}

function listExpenses(groupId) {
  return db
    .prepare(
      `SELECT e.*, m.display_name AS paid_by_name
       FROM expenses e
       JOIN members m ON m.id = e.paid_by_member_id
       WHERE e.group_id = ?
       ORDER BY e.expense_date DESC, e.id DESC`
    )
    .all(groupId)
    .map((expense) => ({
      ...expense,
      amount: fromMinor(expense.amount_minor),
      baseAmount: fromMinor(expense.base_amount_minor),
      splits: db
        .prepare(
          `SELECT s.*, m.display_name
           FROM expense_splits s
           JOIN members m ON m.id = s.member_id
           WHERE s.expense_id = ?
           ORDER BY m.display_name`
        )
        .all(expense.id)
        .map((split) => ({ ...split, owed: fromMinor(split.owed_minor) }))
    }));
}

function getExpense(id) {
  return listExpensesForIds([id])[0] ?? null;
}

function listExpensesForIds(ids) {
  if (!ids.length) return [];
  return ids.map((id) => {
    const expense = db
      .prepare(
        `SELECT e.*, m.display_name AS paid_by_name
         FROM expenses e
         JOIN members m ON m.id = e.paid_by_member_id
         WHERE e.id = ?`
      )
      .get(id);
    return expense ? { ...expense, amount: fromMinor(expense.amount_minor), baseAmount: fromMinor(expense.base_amount_minor) } : null;
  }).filter(Boolean);
}

function createExpense(groupId, userId, body) {
  const parsedAmount = parseAmount(body.amount, body.currency);
  if (!parsedAmount.ok) throw new Error("Invalid amount");
  const exchangeRate = parsedAmount.currency === "USD" ? Number(body.exchangeRate || 83) : 1;
  const baseAmountMinor = baseMinorFrom(parsedAmount.amount, parsedAmount.currency, exchangeRate);
  const splitType = body.splitType || "equal";
  const participantIds = (body.participantIds || []).map(Number);
  let splits;

  if (splitType === "equal") {
    splits = allocateEvenly(baseAmountMinor, participantIds);
  } else if (splitType === "exact") {
    splits = (body.splits || []).map((split) => ({
      memberId: Number(split.memberId),
      owedMinor: baseMinorFrom(Number(split.amount), parsedAmount.currency, exchangeRate)
    }));
  } else if (splitType === "percent" || splitType === "shares") {
    splits = allocateByWeights(
      baseAmountMinor,
      (body.splits || []).map((split) => ({
        memberId: Number(split.memberId),
        weight: Number(split.value)
      }))
    );
  } else {
    throw new Error("Unsupported split type");
  }

  if (!splits || !splits.length) throw new Error("At least one participant is required");
  const result = db
    .prepare(
      `INSERT INTO expenses (
        group_id, expense_date, description, amount_minor, currency, exchange_rate, base_amount_minor,
        paid_by_member_id, split_type, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      groupId,
      body.expenseDate,
      body.description,
      parsedAmount.minor,
      parsedAmount.currency,
      exchangeRate,
      baseAmountMinor,
      Number(body.paidByMemberId),
      splitType,
      userId
    );
  const expenseId = Number(result.lastInsertRowid);
  for (const split of splits) {
    db.prepare("INSERT INTO expense_splits (expense_id, member_id, owed_minor) VALUES (?, ?, ?)").run(
      expenseId,
      split.memberId,
      split.owedMinor
    );
  }
  return getExpense(expenseId);
}

function listPayments(groupId) {
  return db
    .prepare(
      `SELECT p.*, from_m.display_name AS from_name, to_m.display_name AS to_name
       FROM payments p
       JOIN members from_m ON from_m.id = p.from_member_id
       JOIN members to_m ON to_m.id = p.to_member_id
       WHERE p.group_id = ?
       ORDER BY p.payment_date DESC, p.id DESC`
    )
    .all(groupId)
    .map((payment) => ({ ...payment, amount: fromMinor(payment.amount_minor), baseAmount: fromMinor(payment.base_amount_minor) }));
}

function createPayment(groupId, body) {
  const parsedAmount = parseAmount(body.amount, body.currency);
  if (!parsedAmount.ok) throw new Error("Invalid amount");
  const amountMinor = Math.abs(parsedAmount.minor);
  const exchangeRate = parsedAmount.currency === "USD" ? Number(body.exchangeRate || 83) : 1;
  const baseAmountMinor = Math.abs(baseMinorFrom(Math.abs(parsedAmount.amount), parsedAmount.currency, exchangeRate));
  const result = db
    .prepare(
      `INSERT INTO payments (
        group_id, payment_date, from_member_id, to_member_id, amount_minor, currency, exchange_rate, base_amount_minor, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      groupId,
      body.paymentDate,
      Number(body.fromMemberId),
      Number(body.toMemberId),
      amountMinor,
      parsedAmount.currency,
      exchangeRate,
      baseAmountMinor,
      body.notes || null
    );
  return listPayments(groupId).find((payment) => payment.id === Number(result.lastInsertRowid));
}

async function readJson(req, maxBytes = 1_000_000) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > maxBytes) throw new Error("Request body too large");
  }
  return body ? JSON.parse(body) : {};
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS"
  });
  res.end(body);
}

function sendEmpty(res, status) {
  res.writeHead(status, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS"
  });
  res.end();
}

function serveStaticOr404(req, res, url) {
  if (!fs.existsSync(distDir)) return sendJson(res, 404, { error: "Not found" });
  const requested = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
  const safePath = path.normalize(requested).replace(/^(\.\.[/\\])+/, "");
  const fullPath = path.join(distDir, safePath);
  const filePath = fs.existsSync(fullPath) && fs.statSync(fullPath).isFile() ? fullPath : path.join(distDir, "index.html");
  const body = fs.readFileSync(filePath);
  res.writeHead(200, { "Content-Type": contentType(filePath), "Content-Length": body.length });
  res.end(body);
}

function contentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html";
  if (filePath.endsWith(".js")) return "text/javascript";
  if (filePath.endsWith(".css")) return "text/css";
  if (filePath.endsWith(".svg")) return "image/svg+xml";
  return "application/octet-stream";
}
