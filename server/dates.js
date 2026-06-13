const MONTHS = new Map([
  ["jan", 1],
  ["january", 1],
  ["feb", 2],
  ["february", 2],
  ["mar", 3],
  ["march", 3],
  ["apr", 4],
  ["april", 4],
  ["may", 5],
  ["jun", 6],
  ["june", 6],
  ["jul", 7],
  ["july", 7],
  ["aug", 8],
  ["august", 8],
  ["sep", 9],
  ["sept", 9],
  ["september", 9],
  ["oct", 10],
  ["october", 10],
  ["nov", 11],
  ["november", 11],
  ["dec", 12],
  ["december", 12]
]);

export function parseDateValue(value, fallbackYear = new Date().getFullYear()) {
  const source = String(value ?? "").trim();
  if (!source) return { ok: false, date: "", ambiguous: false };

  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(source)) {
    const [year, month, day] = source.split("-").map(Number);
    return makeDate(year, month, day, false);
  }

  if (/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(source)) {
    const [first, second, third] = source.split(/[/-]/).map(Number);
    const year = third < 100 ? 2000 + third : third;
    if (first > 12) return makeDate(year, second, first, false);
    if (second > 12) return makeDate(year, first, second, false);
    return makeDate(year, second, first, true);
  }

  if (/^\d{1,2}\s+[a-z]+(?:\s+\d{2,4})?$/i.test(source)) {
    const [dayText, monthText, yearText] = source.split(/\s+/);
    const month = MONTHS.get(monthText.toLowerCase());
    const year = yearText ? Number(yearText.length === 2 ? `20${yearText}` : yearText) : fallbackYear;
    return makeDate(year, month, Number(dayText), !yearText);
  }

  if (/^[a-z]+\s+\d{1,2}(?:,?\s+\d{2,4})?$/i.test(source)) {
    const parts = source.replace(",", "").split(/\s+/);
    const month = MONTHS.get(parts[0].toLowerCase());
    const day = Number(parts[1]);
    const year = parts[2] ? Number(parts[2].length === 2 ? `20${parts[2]}` : parts[2]) : fallbackYear;
    return makeDate(year, month, day, !parts[2]);
  }

  if (/^\d{5}$/.test(source)) {
    const excelEpoch = Date.UTC(1899, 11, 30);
    const date = new Date(excelEpoch + Number(source) * 24 * 60 * 60 * 1000);
    return { ok: true, date: date.toISOString().slice(0, 10), ambiguous: true };
  }

  const parsed = new Date(source);
  if (!Number.isNaN(parsed.getTime())) {
    return { ok: true, date: parsed.toISOString().slice(0, 10), ambiguous: true };
  }
  return { ok: false, date: "", ambiguous: false };
}

function makeDate(year, month, day, ambiguous) {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    !year ||
    !month ||
    !day ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    return { ok: false, date: "", ambiguous };
  }
  return { ok: true, date: date.toISOString().slice(0, 10), ambiguous };
}

export function isOnOrAfter(date, lowerBound) {
  return !lowerBound || date >= lowerBound;
}

export function isOnOrBefore(date, upperBound) {
  return !upperBound || date <= upperBound;
}
