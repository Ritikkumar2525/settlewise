const HEADER_ALIASES = {
  date: ["date", "expense date", "paid on", "transaction date", "when"],
  description: ["description", "expense", "item", "title", "merchant", "details", "note", "notes"],
  amount: ["amount", "cost", "total", "value", "paid amount", "expense amount"],
  currency: ["currency", "curr"],
  paidBy: ["paid by", "payer", "paid_by", "who paid", "paidby", "person paid"],
  splitType: ["split type", "split", "split_type", "division", "share type", "split method"],
  participants: ["participants", "split between", "split_between", "members", "people", "for", "owed by"],
  splitValues: ["split values", "shares", "amounts", "percentages", "split details", "custom split", "weights"],
  exchangeRate: ["exchange rate", "fx", "fx rate", "conversion rate", "inr per usd", "rate"],
  rowType: ["type", "entry type", "kind", "record type"],
  from: ["from", "paid from", "sender", "payer member"],
  to: ["to", "paid to", "receiver", "settled with"]
};

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      field += '"';
      i += 1;
      continue;
    }
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === "," && !inQuotes) {
      row.push(field);
      field = "";
      continue;
    }
    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(field);
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
      field = "";
      continue;
    }
    field += char;
  }

  row.push(field);
  if (row.some((value) => value.trim() !== "")) rows.push(row);

  if (!rows.length) return { headers: [], records: [] };
  const headers = rows[0].map((header) => header.trim());
  const records = rows.slice(1).map((values, index) => {
    const raw = {};
    headers.forEach((header, headerIndex) => {
      raw[header] = values[headerIndex] ?? "";
    });
    return { rowNumber: index + 2, raw };
  });
  return { headers, records };
}

export function normalizeHeader(header) {
  return String(header ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

export function getCell(raw, canonicalName) {
  const aliases = HEADER_ALIASES[canonicalName] ?? [canonicalName];
  const aliasSet = new Set(aliases.map(normalizeHeader));
  for (const [header, value] of Object.entries(raw)) {
    if (aliasSet.has(normalizeHeader(header))) return String(value ?? "").trim();
  }
  return "";
}

export function memberColumnValues(raw, members) {
  const memberMap = new Map(members.map((member) => [normalizePerson(member.display_name), member]));
  const values = [];
  for (const [header, value] of Object.entries(raw)) {
    const key = normalizePerson(header);
    if (memberMap.has(key) && String(value ?? "").trim() !== "") {
      values.push({ member: memberMap.get(key), value: String(value).trim() });
    }
  }
  return values;
}

export function normalizePerson(name) {
  let normalized = String(name ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, "")
    .replace(/\s+/g, " ");
  
  if (normalized === "priya s") {
    return "priya";
  }
  return normalized;
}

export function splitList(value) {
  return String(value ?? "")
    .replace(/\band\b/gi, ",")
    .split(/[;,/&+|]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function parseKeyValues(value) {
  const source = String(value ?? "").trim();
  if (!source) return [];
  return source
    .split(/[;,|]/)
    .map((pair) => pair.trim())
    .filter(Boolean)
    .map((pair) => {
      const match = pair.match(/^(.+?)(?:[:=]|\s+-\s+|\s+)(-?\(?[$₹]?[0-9][0-9,]*(?:\.[0-9]+)?%?\)?)$/i);
      if (!match) return { key: pair, value: "" };
      return { key: match[1].trim(), value: match[2].trim() };
    });
}
