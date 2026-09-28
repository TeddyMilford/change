// Pure functions. No DOM, no storage.

export const BLOCK_DAYS = 75; // default
export const BLOCK_MAX = 120;

export const QUESTION = 'Were you financially responsible today?';

// ---- dates (local time, YYYY-MM-DD) ----

export function toDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

export function today() {
  return toDateStr(new Date());
}

export function addDays(s, n) {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}

// b - a, in whole days
export function diffDays(a, b) {
  return Math.round((parseDate(b) - parseDate(a)) / 86400000);
}

export function formatDate(s, opts = { month: 'short', day: 'numeric' }) {
  return parseDate(s).toLocaleDateString(undefined, opts);
}

// ---- blocks ----

export function clampLength(n) {
  n = Math.round(Number(n));
  if (!Number.isFinite(n)) return BLOCK_DAYS;
  return Math.min(BLOCK_MAX, Math.max(1, n));
}

export function newBlock(startDate, length = BLOCK_DAYS) {
  return { id: `b_${startDate}_${Math.random().toString(36).slice(2, 8)}`, startDate, length: clampLength(length) };
}

export function blockEnd(block) {
  return addDays(block.startDate, block.length - 1);
}

export function blockDates(block) {
  const out = [];
  for (let i = 0; i < block.length; i++) out.push(addDays(block.startDate, i));
  return out;
}

export function currentBlock(blocks, todayStr) {
  if (!blocks.length) return null;
  const sorted = [...blocks].sort((a, b) => (a.startDate < b.startDate ? -1 : 1));
  const started = sorted.filter((b) => b.startDate <= todayStr);
  return started[started.length - 1] || sorted[0];
}

// 'clean' | 'miss' | 'pending' | 'future'
export function dayStatus(day, date, todayStr) {
  if (date > todayStr) return 'future';
  if (day?.clean === true) return 'clean';
  if (day && day.clean === false) return 'miss';
  if (date === todayStr) return 'pending';
  return 'miss';
}

export function blockSummary(block, days, todayStr) {
  const cells = blockDates(block).map((date) => ({ date, status: dayStatus(days[date], date, todayStr) }));
  const cleanDays = cells.filter((c) => c.status === 'clean').length;
  const rawIndex = diffDays(block.startDate, todayStr) + 1;
  const dayIndex = Math.min(block.length, Math.max(0, rawIndex));
  const end = blockEnd(block);
  return { cells, cleanDays, dayIndex, end, ended: todayStr > end };
}

// Clean days across every block. Never goes down.
export function totalCleanDays(days) {
  return Object.values(days).filter((d) => d.clean === true).length;
}

// Consecutive clean days. current: the run ending today, or yesterday if today isn't logged yet.
export function streaks(days, todayStr) {
  const clean = new Set(Object.keys(days).filter((d) => days[d].clean === true));
  let longest = 0;
  for (const d of clean) {
    if (clean.has(addDays(d, -1))) continue;
    let n = 1;
    let x = d;
    while (clean.has((x = addDays(x, 1)))) n++;
    if (n > longest) longest = n;
  }
  const end = clean.has(todayStr) ? todayStr : days[todayStr] ? null : addDays(todayStr, -1);
  let current = 0;
  for (let x = end; x && clean.has(x); x = addDays(x, -1)) current++;
  return { current, longest };
}
