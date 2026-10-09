/** Exact decimal arithmetic. Normalize unit prices, then lines, then sum lines. */
export type MoneyInput = number | string;
const MAX_CENTS = BigInt("999999999999");
function decimal(value: MoneyInput): {digits: bigint; scale: bigint} {
  const text = String(value).trim().replace(/^([+-]?)\./, "$10.");
  const match = /^([+-]?)(\d+)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(text);
  if (!match || text.length > 80) throw new Error("El importe no es válido.");
  const exponent = Number(match[4] ?? 0);
  if (Math.abs(exponent) > 20) throw new Error("El importe supera el rango permitido.");
  const places = (match[3]?.length ?? 0) - exponent;
  let digits = BigInt(match[2] + (match[3] ?? ""));
  if (match[1] === "-") digits = -digits;
  if (places < 0) digits *= BigInt(10) ** BigInt(-places);
  return {digits, scale: BigInt(10) ** BigInt(Math.max(0, places))};
}
function rounded(numerator: bigint, denominator: bigint): bigint {
  const sign = numerator < BigInt(0) ? BigInt(-1) : BigInt(1);
  const absolute = numerator * sign;
  return sign * ((absolute * BigInt(2) + denominator) / (denominator * BigInt(2)));
}
function checked(cents: bigint): number {
  if (cents < BigInt(0) || cents > MAX_CENTS) throw new Error("El importe supera el rango permitido.");
  return Number(cents) / 100;
}
export function toCents(value: MoneyInput): number {
  const parsed = decimal(value);
  const cents = rounded(parsed.digits * BigInt(100), parsed.scale);
  checked(cents);
  return Number(cents);
}
export function money(value: MoneyInput): number { return toCents(value) / 100; }
export function moneySum(values: MoneyInput[]): number {
  return checked(values.reduce((total, value) => total + BigInt(toCents(value)), BigInt(0)));
}
export function moneyMultiply(unit: MoneyInput, quantity: MoneyInput): number {
  const parsed = decimal(quantity);
  return checked(rounded(BigInt(toCents(unit)) * parsed.digits, parsed.scale));
}
export function moneyDivide(total: MoneyInput, quantity: MoneyInput): number {
  const parsed = decimal(quantity);
  if (parsed.digits <= BigInt(0)) throw new Error("La cantidad debe ser mayor que cero.");
  return checked(rounded(BigInt(toCents(total)) * parsed.scale, parsed.digits));
}
export function orderTotal(subtotal: MoneyInput, discount: MoneyInput, delivery: MoneyInput): number {
  const total = BigInt(toCents(subtotal)) - BigInt(toCents(discount)) + BigInt(toCents(delivery));
  return checked(total < BigInt(0) ? BigInt(0) : total);
}
