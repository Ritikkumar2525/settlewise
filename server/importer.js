import { createHash } from "node:crypto";
import {
  getCell,
  memberColumnValues,
  normalizePerson,
  parseCsv,
  parseKeyValues,
  splitList
} from "./csv.js";
import { isOnOrAfter, isOnOrBefore, parseDateValue } from "./dates.js";
import {
  DEFAULT_USD_INR_RATE,
  allocateByWeights,
  allocateEvenly,
  baseMinorFrom,
  parseAmount,
  toMinor
} from "./money.js";

const REVIEW = "pending_approval";
const CORRECTION = "needs_correction";
const AUTO = "auto_applied";

export function importExpensesCsv(db, { groupId, userId, fileName, csvText }) {
  const importResult = db
    .prepare(
      "INSERT INTO imports (group_id, file_name, status, created_by, summary_json) VALUES (?, ?, ?, ?, ?)"
    )
    .run(groupId, fileName || "expenses_export.csv", "running", userId, "{}");
  const importId = Number(importResult.lastInsertRowid);
  const state = {
    importId,
    groupId,
    userId,
    fileName: fileName || "expenses_export.csv",
    members: loadMembers(db, groupId),
    existingKeys: loadExistingKeys(db, groupId),
    currentKeys: new Set(),
    summary: {
      rowsSeen: 0,
      expensesImported: 0,
      paymentsImported: 0,
      rowsSkipped: 0,
      rowsBlocked: 0,
      anomalies: 0
    }
  };

  const { headers, records } = parseCsv(csvText ?? "");
  if (headers.length === 0) {
    insertAnomaly(db, importId, {
      rowNumber: null,
      severity: "error",
      code: "EMPTY_FILE",
      message: "The uploaded CSV did not contain a header row.",
      policy: "A file without headers cannot be mapped safely.",
      action: "Import stopped.",
      resolutionStatus: CORRECTION,
      raw: {}
    });
    finishImport(db, importId, "failed", state.summary);
    return getImportReport(db, importId);
  }

  const missingRequired = ["date", "amount", "paidBy"].filter((field) => !hasCanonicalHeader(headers, field));
  if (missingRequired.length) {
    insertAnomaly(db, importId, {
      rowNumber: null,
      severity: "error",
      code: "MISSING_REQUIRED_HEADERS",
      message: `Missing required column(s): ${missingRequired.join(", ")}.`,
      policy: "The importer accepts header aliases, but date, amount, and payer must be identifiable.",
      action: "Import stopped.",
      resolutionStatus: CORRECTION,
      raw: { headers }
    });
    finishImport(db, importId, "failed", state.summary);
    return getImportReport(db, importId);
  }

  db.exec("BEGIN");
  try {
    for (const record of records) {
      state.summary.rowsSeen += 1;
      processRecord(db, state, record);
    }
    finishImport(db, importId, "completed", state.summary);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    db.prepare("UPDATE imports SET status = ?, summary_json = ? WHERE id = ?").run(
      "failed",
      JSON.stringify({ ...state.summary, error: error.message }),
      importId
    );
    throw error;
  }

  return getImportReport(db, importId);
}

export function getImportReport(db, importId) {
  const imported = db.prepare("SELECT * FROM imports WHERE id = ?").get(importId);
  if (!imported) return null;
  const rows = db
    .prepare("SELECT * FROM import_rows WHERE import_id = ? ORDER BY row_number")
    .all(importId)
    .map((row) => ({
      ...row,
      raw: JSON.parse(row.raw_json)
    }));
  const anomalies = db
    .prepare("SELECT * FROM import_anomalies WHERE import_id = ? ORDER BY COALESCE(row_number, 0), id")
    .all(importId)
    .map((row) => ({
      ...row,
      raw: row.raw_json ? JSON.parse(row.raw_json) : null,
      proposedPatch: row.proposed_patch_json ? JSON.parse(row.proposed_patch_json) : null
    }));

  return {
    ...imported,
    summary: JSON.parse(imported.summary_json),
    rows,
    anomalies
  };
}

export function updateAnomalyResolution(db, anomalyId, resolutionStatus) {
  const allowed = new Set(["auto_applied", "pending_approval", "approved", "needs_correction", "rejected"]);
  if (!allowed.has(resolutionStatus)) throw new Error("Unsupported resolution status");
  db.prepare("UPDATE import_anomalies SET resolution_status = ? WHERE id = ?").run(
    resolutionStatus,
    anomalyId
  );
  return db.prepare("SELECT * FROM import_anomalies WHERE id = ?").get(anomalyId);
}

function processRecord(db, state, record) {
  const anomalies = [];
  const raw = record.raw;
  const rowHash = hashObject(raw);
  const fallbackYear = inferFallbackYear(raw) ?? 2024;
  const parsedDate = parseDateValue(getCell(raw, "date"), fallbackYear);
  if (!parsedDate.ok) {
    anomalies.push(error("INVALID_DATE", "Date could not be parsed.", "Rows without a valid date are blocked.", "Blocked row."));
  } else if (parsedDate.ambiguous) {
    anomalies.push(
      warning(
        "AMBIGUOUS_DATE",
        `Date '${getCell(raw, "date")}' was normalized to ${parsedDate.date}.`,
        "Ambiguous dates are parsed using Indian day-first conventions unless the year/month order is explicit.",
        "Imported with normalized date."
      )
    );
  }

  const amount = parseAmount(getCell(raw, "amount"), getCell(raw, "currency"));
  if (!amount.ok) {
    anomalies.push(error("INVALID_AMOUNT", "Amount could not be parsed.", "Rows without a numeric amount are blocked.", "Blocked row."));
  } else {
    if (amount.thousandsTypo) {
      anomalies.push(warning("THOUSANDS_SEPARATOR_TYPO", `Amount '${amount.raw}' contained a dot instead of a comma.`, "European formatting or typos using dots for thousands are normalized.", `Parsed as ${amount.amount}.`));
    }
    if (amount.missingCurrency) {
      anomalies.push(warning("MISSING_CURRENCY", `Currency was missing for amount ${amount.amount}.`, "Empty currency fields default to the group's base currency.", `Imported as ${amount.currency}.`));
    }
  }

  let exchangeRate = Number(getCell(raw, "exchangeRate"));
  if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) {
    exchangeRate = amount.currency === "USD" ? DEFAULT_USD_INR_RATE : 1;
    if (amount.currency === "USD") {
      anomalies.push(
        warning(
          "FX_RATE_DEFAULTED",
          `USD amount converted using ${DEFAULT_USD_INR_RATE} INR per USD.`,
          "USD is never treated as INR. If the sheet omits a rate, a documented default is applied and surfaced.",
          "Imported with default FX rate."
        )
      );
    }
  }

  const date = parsedDate.date;
  const description = getCell(raw, "description") || `Untitled row ${record.rowNumber}`;
  if (!getCell(raw, "description")) {
    anomalies.push(
      warning(
        "MISSING_DESCRIPTION",
        "Description was empty.",
        "Empty descriptions are preserved as traceable untitled rows rather than guessed from other cells.",
        `Imported as '${description}'.`
      )
    );
  }

  if (hasBlocking(anomalies)) {
    saveRow(db, state, record, rowHash, "blocked", anomalies);
    return;
  }

  if (looksLikeSettlement(raw, description)) {
    processPaymentRecord(db, state, record, rowHash, {
      anomalies,
      date,
      amount,
      exchangeRate,
      description
    });
    return;
  }

  processExpenseRecord(db, state, record, rowHash, {
    anomalies,
    date,
    amount,
    exchangeRate,
    description
  });
}

function processExpenseRecord(db, state, record, rowHash, context) {
  const { anomalies, date, amount, exchangeRate, description } = context;
  const payer = resolveMember(state, getCell(record.raw, "paidBy"));
  if (!payer) {
    anomalies.push(
      error(
        "UNKNOWN_PAYER",
        `Payer '${getCell(record.raw, "paidBy")}' is not a known group member.`,
        "Unknown payers are blocked so typo-created balances are not silently introduced.",
        "Blocked row."
      )
    );
  } else if (!isActive(state, payer.id, date)) {
    anomalies.push(
      error(
        "PAYER_NOT_ACTIVE",
        `${payer.display_name} was not active in the group on ${date}.`,
        "Expenses cannot be paid by someone outside their membership window unless the membership is corrected.",
        "Blocked row."
      )
    );
  }

  if (amount.minor < 0) {
    const isRefund = /refund|reversal|returned|credit/i.test(description);
    anomalies.push(
      warning(
        isRefund ? "NEGATIVE_REFUND" : "NEGATIVE_AMOUNT_REVIEW",
        isRefund ? "Negative amount was treated as a refund." : "Negative amount was imported as a reversing expense.",
        "Negative rows are not dropped. They reverse the payer and owed amounts and stay visible in trace details.",
        "Imported as negative expense."
      )
    );
  }

  const split = computeSplits(state, record.raw, date, amount, exchangeRate, anomalies);
  if (!split.ok) {
    anomalies.push(split.anomaly);
  }

  if (hasBlocking(anomalies)) {
    saveRow(db, state, record, rowHash, "blocked", anomalies);
    return;
  }

  const baseAmountMinor = baseMinorFrom(amount.amount, amount.currency, exchangeRate);
  const naturalKey = makeNaturalKey({
    date,
    description,
    payerId: payer.id,
    baseAmountMinor,
    splitType: split.type,
    participants: split.splits.map((item) => item.memberId)
  });

  if (state.existingKeys.has(rowHash) || state.currentKeys.has(rowHash) || state.existingKeys.has(naturalKey) || state.currentKeys.has(naturalKey)) {
    anomalies.push(
      reviewWarning(
        "DUPLICATE_EXACT",
        "This row matches an already imported expense.",
        "Exact duplicates are skipped and left for user approval rather than imported twice.",
        "Skipped duplicate."
      )
    );
    saveRow(db, state, record, rowHash, "skipped_duplicate", anomalies);
    return;
  }

  const conflicting = findConflictingDuplicate(db, state.groupId, {
    date,
    description,
    payerId: payer.id
  });
  if (conflicting && Math.abs(conflicting.base_amount_minor) !== Math.abs(baseAmountMinor)) {
    anomalies.push(
      reviewError(
        "DUPLICATE_CONFLICT",
        `Possible duplicate of expense #${conflicting.id}, but amounts differ.`,
        "When two people logged the same-looking expense with different amounts, neither row wins automatically.",
        "Blocked row for review."
      )
    );
    saveRow(db, state, record, rowHash, "blocked", anomalies);
    return;
  }

  const expenseResult = db
    .prepare(
      `INSERT INTO expenses (
        group_id, expense_date, description, amount_minor, currency, exchange_rate, base_amount_minor,
        paid_by_member_id, split_type, source_row_hash, source_file, notes, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      state.groupId,
      date,
      description,
      amount.minor,
      amount.currency,
      exchangeRate,
      baseAmountMinor,
      payer.id,
      split.type,
      rowHash,
      state.fileName,
      getCell(record.raw, "description") ? null : "Description generated during import",
      state.userId
    );
  const expenseId = Number(expenseResult.lastInsertRowid);
  for (const item of split.splits) {
    db.prepare(
      "INSERT INTO expense_splits (expense_id, member_id, owed_minor, raw_value, share_weight, percent) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(expenseId, item.memberId, item.owedMinor, item.rawValue ?? null, item.weight ?? null, item.percent ?? null);
  }

  state.summary.expensesImported += 1;
  state.currentKeys.add(rowHash);
  state.currentKeys.add(naturalKey);
  saveRow(db, state, record, rowHash, "imported_expense", anomalies, { expenseId });
}

function processPaymentRecord(db, state, record, rowHash, context) {
  const { anomalies, date, amount, exchangeRate, description } = context;
  const parties = resolvePaymentParties(state, record.raw, description);
  if (!parties.from) {
    anomalies.push(error("PAYMENT_FROM_UNKNOWN", "Payment sender could not be identified.", "Settlements need an explicit sender.", "Blocked row."));
  }
  if (!parties.to) {
    anomalies.push(error("PAYMENT_TO_UNKNOWN", "Payment receiver could not be identified.", "Settlements need an explicit receiver.", "Blocked row."));
  }
  if (parties.from && parties.to && parties.from.id === parties.to.id) {
    anomalies.push(error("PAYMENT_SELF_TRANSFER", "Payment sender and receiver are the same member.", "Self-payments do not change balances.", "Blocked row."));
  }
  if (amount.minor < 0) {
    anomalies.push(
      warning(
        "NEGATIVE_PAYMENT_NORMALIZED",
        "Negative settlement amount was converted to a positive payment amount.",
        "Payments model direction separately from amount, so the amount is stored positive.",
        "Imported as positive payment."
      )
    );
  }
  anomalies.push(
    warning(
      "SETTLEMENT_AS_PAYMENT",
      "Settlement-like row was recorded as a payment, not an expense.",
      "Rows that describe repayments or transfers reduce balances and do not create new owed shares.",
      "Imported as payment."
    )
  );

  if (hasBlocking(anomalies)) {
    saveRow(db, state, record, rowHash, "blocked", anomalies);
    return;
  }

  const signedAmount = Math.abs(amount.amount);
  const amountMinor = Math.abs(amount.minor);
  const baseAmountMinor = Math.abs(baseMinorFrom(signedAmount, amount.currency, exchangeRate));
  if (state.existingKeys.has(rowHash) || state.currentKeys.has(rowHash)) {
    anomalies.push(
      reviewWarning(
        "DUPLICATE_PAYMENT",
        "This payment row was already imported.",
        "Duplicate payments are skipped to avoid reducing a debt twice.",
        "Skipped duplicate."
      )
    );
    saveRow(db, state, record, rowHash, "skipped_duplicate", anomalies);
    return;
  }

  const paymentResult = db
    .prepare(
      `INSERT INTO payments (
        group_id, payment_date, from_member_id, to_member_id, amount_minor, currency, exchange_rate,
        base_amount_minor, notes, source_row_hash, source_file
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      state.groupId,
      date,
      parties.from.id,
      parties.to.id,
      amountMinor,
      amount.currency,
      exchangeRate,
      baseAmountMinor,
      description,
      rowHash,
      state.fileName
    );
  const paymentId = Number(paymentResult.lastInsertRowid);
  state.summary.paymentsImported += 1;
  state.currentKeys.add(rowHash);
  saveRow(db, state, record, rowHash, "imported_payment", anomalies, { paymentId });
}

function computeSplits(state, raw, date, amount, exchangeRate, anomalies) {
  const splitType = normalizeSplitType(getCell(raw, "splitType"));
  const memberColumns = memberColumnValues(raw, state.members);
  const splitValues = getCell(raw, "splitValues");
  let participants = parseParticipants(state, getCell(raw, "participants"), date, anomalies);
  const baseAmountMinor = baseMinorFrom(amount.amount, amount.currency, exchangeRate);

  if (memberColumns.length && !participants.length) {
    participants = memberColumns.map((item) => item.member);
  }

  const effectiveType = splitType || inferSplitType(memberColumns, splitValues);
  if (!effectiveType) {
    anomalies.push(
      warning(
        "SPLIT_TYPE_DEFAULTED",
        "Split type was missing.",
        "Missing split types default to equal only when participants can be identified.",
        "Imported as equal split."
      )
    );
  }
  const type = effectiveType || "equal";

  if (!participants.length && type === "equal") {
    participants = activeMembers(state, date);
    anomalies.push(
      warning(
        "IMPLIED_ACTIVE_MEMBERS",
        `No split participants were listed; used active members on ${date}.`,
        "Blank equal splits use membership windows, so Sam is excluded before joining and Meera after leaving.",
        "Imported with active members."
      )
    );
  }

  if (!participants.length) {
    return {
      ok: false,
      anomaly: error("NO_PARTICIPANTS", "No split participants could be identified.", "Rows without participants are blocked unless equal split can use active members.", "Blocked row.")
    };
  }

  const inactive = participants.filter((member) => !isActive(state, member.id, date));
  if (inactive.length) {
    return {
      ok: false,
      anomaly: error(
        "PARTICIPANT_NOT_ACTIVE",
        `${inactive.map((member) => member.display_name).join(", ")} not active on ${date}.`,
        "Membership windows are enforced for explicit participants.",
        "Blocked row."
      )
    };
  }

  if (type === "equal") {
    return {
      ok: true,
      type,
      splits: allocateEvenly(baseAmountMinor, participants.map((member) => member.id))
    };
  }

  if (!["exact", "percent", "shares"].includes(type)) {
    return {
      ok: false,
      anomaly: error("UNSUPPORTED_SPLIT_TYPE", `Split type '${type}' is not supported.`, "The importer blocks unknown split types until a policy is added.", "Blocked row.")
    };
  }

  let valuePairs;
  if (memberColumns.length) {
    valuePairs = memberColumns.map((item) => ({ member: item.member, value: item.value }));
  } else {
    const parsedPairs = parseKeyValues(splitValues);
    const orderedValuesOnly = parsedPairs.length === participants.length && parsedPairs.every((item) => !item.value);
    valuePairs = orderedValuesOnly
      ? participants.map((member, index) => ({ member, value: parsedPairs[index].key, key: member.display_name }))
      : parsedPairs.map((item) => ({ member: resolveMember(state, item.key), value: item.value, key: item.key }));
  }

  if (!valuePairs.length) {
    return {
      ok: false,
      anomaly: error("MISSING_SPLIT_VALUES", `Split type '${type}' needs values.`, "Custom splits require explicit values per member.", "Blocked row.")
    };
  }

  const unresolved = valuePairs.filter((item) => !item.member);
  if (unresolved.length) {
    return {
      ok: false,
      anomaly: error(
        "UNKNOWN_SPLIT_MEMBER",
        `Unknown split member(s): ${unresolved.map((item) => item.key).join(", ")}.`,
        "Unknown split members are blocked to avoid typo-created balances.",
        "Blocked row."
      )
    };
  }

  const valueMemberIds = new Set(valuePairs.map((item) => item.member.id));
  const missingParticipants = participants.filter((member) => !valueMemberIds.has(member.id));
  if (missingParticipants.length) {
    anomalies.push(
      warning(
        "SPLIT_PARTICIPANTS_FROM_VALUES",
        "Participant list did not match split values.",
        "For custom splits, member/value pairs are treated as the authoritative participant list.",
        "Imported using split value members."
      )
    );
  }

  if (type === "exact") {
    const splits = valuePairs.map((item) => {
      const parsed = parseAmount(item.value, amount.currency);
      return {
        memberId: item.member.id,
        owedMinor: baseMinorFrom(parsed.amount, parsed.currency || amount.currency, parsed.currency === "USD" ? exchangeRate : 1),
        rawValue: item.value
      };
    });
    const splitTotal = splits.reduce((sum, item) => sum + item.owedMinor, 0);
    const delta = baseAmountMinor - splitTotal;
    if (Math.abs(delta) > 100) {
      return {
        ok: false,
        anomaly: error(
          "EXACT_SPLIT_TOTAL_MISMATCH",
          `Exact split values differ from expense amount by ${Math.abs(delta) / 100} INR.`,
          "Large exact split mismatches are blocked; the app does not choose a winning amount.",
          "Blocked row."
        )
      };
    }
    if (delta !== 0) {
      splits[splits.length - 1].owedMinor += delta;
      anomalies.push(
        warning(
          "ROUNDING_ADJUSTED",
          "Exact split differed from total by at most INR 1.",
          "Small rounding differences are assigned to the last split member and logged.",
          "Imported with rounding adjustment."
        )
      );
    }
    return { ok: true, type, splits };
  }

  if (type === "percent") {
    const weighted = valuePairs.map((item) => ({
      memberId: item.member.id,
      weight: Number(String(item.value).replace("%", "")),
      rawValue: item.value,
      percent: Number(String(item.value).replace("%", ""))
    }));
    const total = weighted.reduce((sum, item) => sum + item.weight, 0);
    if (!Number.isFinite(total) || Math.abs(total - 100) > 0.1) {
      return {
        ok: false,
        anomaly: error("PERCENT_TOTAL_MISMATCH", `Percent split totals ${total}, not 100.`, "Percent splits must total 100 except tiny spreadsheet rounding.", "Blocked row.")
      };
    }
    return { ok: true, type, splits: allocateByWeights(baseAmountMinor, weighted) };
  }

  if (type === "shares") {
    const weighted = valuePairs.map((item) => ({
      memberId: item.member.id,
      weight: Number(item.value),
      rawValue: item.value
    }));
    if (weighted.some((item) => !Number.isFinite(item.weight) || item.weight <= 0)) {
      return {
        ok: false,
        anomaly: error("INVALID_SHARE_WEIGHT", "Share split contained a non-positive weight.", "Share weights must be positive numbers.", "Blocked row.")
      };
    }
    return { ok: true, type, splits: allocateByWeights(baseAmountMinor, weighted) };
  }

  return {
    ok: false,
    anomaly: error("UNSUPPORTED_SPLIT_TYPE", `Split type '${type}' is not supported.`, "The importer blocks unknown split types until a policy is added.", "Blocked row.")
  };
}

function parseParticipants(state, value, date, anomalies) {
  const text = String(value ?? "").trim();
  if (!text) return [];
  if (/^(all|everyone|flatmates|active)$/i.test(text)) {
    anomalies.push(
      warning(
        "ALL_PARTICIPANTS_BY_MEMBERSHIP",
        `'${text}' was expanded using active memberships on ${date}.`,
        "All/everyone never means all historical members; membership dates decide who is included.",
        "Imported with active members."
      )
    );
    return activeMembers(state, date);
  }
  const members = [];
  for (const name of splitList(text)) {
    const member = resolveMember(state, name);
    if (member) {
      members.push(member);
    } else {
      anomalies.push(
        error(
          "UNKNOWN_PARTICIPANT",
          `Participant '${name}' is not a known group member.`,
          "Unknown participants are blocked so typos cannot silently change balances.",
          "Blocked row."
        )
      );
    }
  }
  return members;
}

function normalizeSplitType(value) {
  const text = String(value ?? "").trim().toLowerCase();
  if (!text) return "";
  if (["equal", "equally", "split equally", "even", "evenly"].includes(text)) return "equal";
  if (["exact", "amount", "amounts", "custom amounts", "itemized"].includes(text)) return "exact";
  if (["percent", "percentage", "percentages", "%"].includes(text)) return "percent";
  if (["share", "shares", "weight", "weights", "ratio"].includes(text)) return "shares";
  if (["settlement", "payment", "settle"].includes(text)) return "payment";
  return text;
}

function inferSplitType(memberColumns, splitValues) {
  const values = memberColumns.length ? memberColumns.map((item) => item.value).join(" ") : splitValues;
  if (!values) return "";
  if (String(values).includes("%")) return "percent";
  if (parseKeyValues(values).some((item) => /[$₹]|\b(inr|rs|usd)\b/i.test(item.value))) return "exact";
  return "shares";
}

function looksLikeSettlement(raw, description) {
  const type = normalizeSplitType(getCell(raw, "rowType")) || normalizeSplitType(getCell(raw, "splitType"));
  if (type === "payment") return true;
  return /\b(settle|settlement|paid back|payback|repay|reimburse|transfer|settled)\b/i.test(description);
}

function resolvePaymentParties(state, raw, description) {
  const fromText = getCell(raw, "from") || getCell(raw, "paidBy");
  const explicitTo = getCell(raw, "to");
  const from = resolveMember(state, fromText);
  let to = resolveMember(state, explicitTo);
  if (!to) {
    const mentioned = state.members.filter((member) => {
      const pattern = new RegExp(`\\b${escapeRegex(member.display_name)}\\b`, "i");
      return pattern.test(description) && member.id !== from?.id;
    });
    to = mentioned[0] ?? null;
  }
  return { from, to };
}

function loadMembers(db, groupId) {
  return db
    .prepare(
      `SELECT m.id, m.display_name, m.email, gm.joined_on, gm.left_on
       FROM members m
       JOIN group_memberships gm ON gm.member_id = m.id
       WHERE gm.group_id = ?
       ORDER BY m.display_name`
    )
    .all(groupId);
}

function loadExistingKeys(db, groupId) {
  const keys = new Set();
  for (const row of db.prepare("SELECT source_row_hash FROM expenses WHERE group_id = ? AND source_row_hash IS NOT NULL").all(groupId)) {
    keys.add(row.source_row_hash);
  }
  for (const row of db.prepare("SELECT source_row_hash FROM payments WHERE group_id = ? AND source_row_hash IS NOT NULL").all(groupId)) {
    keys.add(row.source_row_hash);
  }
  const expenses = db
    .prepare(
      `SELECT e.id, e.expense_date, e.description, e.paid_by_member_id, e.base_amount_minor, e.split_type,
              GROUP_CONCAT(s.member_id, ',') AS participants
       FROM expenses e
       JOIN expense_splits s ON s.expense_id = e.id
       WHERE e.group_id = ?
       GROUP BY e.id`
    )
    .all(groupId);
  for (const expense of expenses) {
    keys.add(
      makeNaturalKey({
        date: expense.expense_date,
        description: expense.description,
        payerId: expense.paid_by_member_id,
        baseAmountMinor: expense.base_amount_minor,
        splitType: expense.split_type,
        participants: String(expense.participants).split(",").map(Number)
      })
    );
  }
  return keys;
}

function findConflictingDuplicate(db, groupId, { date, description, payerId }) {
  const normalized = normalizeDescription(description);
  const rows = db
    .prepare(
      `SELECT id, description, base_amount_minor
       FROM expenses
       WHERE group_id = ? AND expense_date = ? AND paid_by_member_id = ?`
    )
    .all(groupId, date, payerId);
  return rows.find((row) => normalizeDescription(row.description) === normalized) ?? null;
}

function resolveMember(state, name) {
  const normalized = normalizePerson(name);
  if (!normalized) return null;
  return state.members.find((member) => normalizePerson(member.display_name) === normalized) ?? null;
}

function activeMembers(state, date) {
  return state.members.filter((member) => isActive(state, member.id, date));
}

function isActive(state, memberId, date) {
  return state.members.some(
    (member) =>
      member.id === memberId && isOnOrAfter(date, member.joined_on) && isOnOrBefore(date, member.left_on)
  );
}

function saveRow(db, state, record, rowHash, action, anomalies, options = {}) {
  const result = db
    .prepare(
      "INSERT INTO import_rows (import_id, row_number, row_hash, action, expense_id, payment_id, raw_json) VALUES (?, ?, ?, ?, ?, ?, ?)"
    )
    .run(
      state.importId,
      record.rowNumber,
      rowHash,
      action,
      options.expenseId ?? null,
      options.paymentId ?? null,
      JSON.stringify(record.raw)
    );
  if (action.startsWith("skipped")) state.summary.rowsSkipped += 1;
  if (action === "blocked") state.summary.rowsBlocked += 1;

  for (const anomaly of anomalies) {
    insertAnomaly(db, state.importId, {
      ...anomaly,
      rowNumber: record.rowNumber,
      raw: record.raw,
      resolutionStatus: options.resolutionStatus ?? anomaly.resolutionStatus
    });
    state.summary.anomalies += 1;
  }
  return Number(result.lastInsertRowid);
}

function insertAnomaly(db, importId, anomaly) {
  db.prepare(
    `INSERT INTO import_anomalies (
      import_id, row_number, severity, code, message, policy, action, raw_json, resolution_status, proposed_patch_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    importId,
    anomaly.rowNumber ?? null,
    anomaly.severity,
    anomaly.code,
    anomaly.message,
    anomaly.policy,
    anomaly.action,
    anomaly.raw ? JSON.stringify(anomaly.raw) : null,
    anomaly.resolutionStatus ?? (anomaly.severity === "error" ? CORRECTION : AUTO),
    anomaly.proposedPatch ? JSON.stringify(anomaly.proposedPatch) : null
  );
}

function finishImport(db, importId, status, summary) {
  db.prepare("UPDATE imports SET status = ?, summary_json = ? WHERE id = ?").run(
    status,
    JSON.stringify(summary),
    importId
  );
}

function hasBlocking(anomalies) {
  return anomalies.some((anomaly) => anomaly.severity === "error");
}

function warning(code, message, policy, action) {
  return { severity: "warning", code, message, policy, action, resolutionStatus: AUTO };
}

function reviewWarning(code, message, policy, action) {
  return { severity: "warning", code, message, policy, action, resolutionStatus: REVIEW };
}

function error(code, message, policy, action) {
  return { severity: "error", code, message, policy, action, resolutionStatus: CORRECTION };
}

function reviewError(code, message, policy, action) {
  return { severity: "error", code, message, policy, action, resolutionStatus: REVIEW };
}

function hasCanonicalHeader(headers, canonicalName) {
  const aliases = {
    date: ["date", "expense date", "paid on", "transaction date", "when"],
    amount: ["amount", "cost", "total", "value", "paid amount", "expense amount"],
    paidBy: ["paid by", "payer", "paid_by", "who paid", "paidby", "person paid"]
  };
  const normalizedHeaders = headers.map((header) => normalizePerson(header));
  return aliases[canonicalName].some((alias) => normalizedHeaders.includes(normalizePerson(alias)));
}

function inferFallbackYear(raw) {
  const dateText = getCell(raw, "date");
  const match = String(dateText).match(/\b(20\d{2})\b/);
  return match ? Number(match[1]) : null;
}

function makeNaturalKey({ date, description, payerId, baseAmountMinor, splitType, participants }) {
  return [
    "expense",
    date,
    normalizeDescription(description),
    payerId,
    Math.abs(Number(baseAmountMinor)),
    splitType,
    [...participants].sort((a, b) => Number(a) - Number(b)).join("-")
  ].join("|");
}

function normalizeDescription(description) {
  return String(description ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(the|a|an|for|at)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function hashObject(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
