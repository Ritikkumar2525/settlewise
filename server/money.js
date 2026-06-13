export const BASE_CURRENCY = "INR";
export const DEFAULT_USD_INR_RATE = 83;

export function toMinor(amount) {
  return Math.round(Number(amount) * 100);
}

export function fromMinor(minor) {
  return Number((minor / 100).toFixed(2));
}

export function normalizeCurrency(value, amountText = "") {
  const text = `${value ?? ""} ${amountText ?? ""}`.toLowerCase();
  if (text.includes("usd") || text.includes("dollar") || text.includes("$")) return "USD";
  if (text.includes("inr") || text.includes("rs") || text.includes("rupee") || text.includes("₹")) return "INR";
  return "";
}

export function parseAmount(amountText, currencyText = "") {
  const source = String(amountText ?? "").trim();
  let missingCurrency = false;
  let currency = normalizeCurrency(currencyText, source);
  if (!currency) {
    currency = "INR";
    missingCurrency = true;
  }
  
  const parenthesesNegative = /^\(.*\)$/.test(source);
  let cleaned = source
    .replace(/[,$₹]/g, "")
    .replace(/\b(inr|rs\.?|rupees?|usd|dollars?)\b/gi, "")
    .replace(/[()]/g, "")
    .trim();
    
  let thousandsTypo = false;
  if (/^\d+\.\d{3}$/.test(cleaned) && cleaned.endsWith("00")) {
    cleaned = cleaned.replace(".", "");
    thousandsTypo = true;
  }

  const amount = Number(cleaned);
  if (!Number.isFinite(amount)) {
    return { ok: false, amount: 0, minor: 0, currency, raw: amountText, thousandsTypo, missingCurrency };
  }
  const signed = parenthesesNegative && amount > 0 ? -amount : amount;
  return { ok: true, amount: signed, minor: toMinor(signed), currency, raw: amountText, thousandsTypo, missingCurrency };
}

export function baseMinorFrom(amount, currency, exchangeRate) {
  const rate = currency === BASE_CURRENCY ? 1 : Number(exchangeRate);
  return toMinor(Number(amount) * rate);
}

export function allocateEvenly(totalMinor, ids) {
  if (!ids.length) return [];
  const sign = totalMinor < 0 ? -1 : 1;
  const absolute = Math.abs(totalMinor);
  const base = Math.floor(absolute / ids.length);
  let remainder = absolute % ids.length;
  return ids.map((id) => {
    const extra = remainder > 0 ? 1 : 0;
    remainder -= extra;
    return { memberId: id, owedMinor: sign * (base + extra) };
  });
}

export function allocateByWeights(totalMinor, weightedIds) {
  const totalWeight = weightedIds.reduce((sum, item) => sum + Number(item.weight), 0);
  if (!Number.isFinite(totalWeight) || totalWeight <= 0) return null;
  const sign = totalMinor < 0 ? -1 : 1;
  const absolute = Math.abs(totalMinor);
  const raw = weightedIds.map((item) => {
    const exact = (absolute * Number(item.weight)) / totalWeight;
    return { ...item, floor: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });
  let distributed = raw.reduce((sum, item) => sum + item.floor, 0);
  raw.sort((a, b) => b.remainder - a.remainder || String(a.memberId).localeCompare(String(b.memberId)));
  for (const item of raw) {
    if (distributed >= absolute) break;
    item.floor += 1;
    distributed += 1;
  }
  raw.sort((a, b) => String(a.memberId).localeCompare(String(b.memberId)));
  return raw.map((item) => ({ memberId: item.memberId, owedMinor: sign * item.floor }));
}

export function formatMoney(minor, currency = BASE_CURRENCY) {
  const amount = fromMinor(minor);
  return `${currency} ${amount.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}
