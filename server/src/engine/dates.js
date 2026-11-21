// Date helpers. All dates are 'YYYY-MM-DD' strings, handled in UTC to avoid timezone bugs.
export const iso = (d) => d.toISOString().slice(0, 10);

export function monthDays(year, month) {
  const n = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return Array.from({ length: n }, (_, i) =>
    `${year}-${String(month).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`);
}
export const dow = (s) => new Date(s + 'T00:00:00Z').getUTCDay(); // 0 = Sunday

// Weeks run Monday to Sunday. Returns the Monday of the week for a date.
export function weekKey(s) {
  const d = new Date(s + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return iso(d);
}
export function groupWeeks(days) {
  const m = new Map();
  for (const d of days) {
    const k = weekKey(d);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(d);
  }
  return m;
}
