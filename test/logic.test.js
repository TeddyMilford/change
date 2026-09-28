import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, diffDays, newBlock, blockEnd, blockDates, blockSummary, dayStatus, currentBlock, totalCleanDays, streaks } from '../src/logic.js';

test('block spans 75 days inclusive', () => {
  const b = newBlock('2026-09-28');
  assert.equal(blockEnd(b), '2026-12-11');
  assert.equal(blockDates(b).length, 75);
  assert.equal(diffDays(b.startDate, blockEnd(b)), 74);
});

test('addDays crosses DST boundaries cleanly', () => {
  assert.equal(addDays('2026-10-31', 2), '2026-11-02');
  assert.equal(addDays('2026-03-07', 2), '2026-03-09');
});

test('dayStatus', () => {
  const t = '2026-10-05';
  assert.equal(dayStatus(undefined, '2026-10-06', t), 'future');
  assert.equal(dayStatus(undefined, t, t), 'pending');
  assert.equal(dayStatus(undefined, '2026-10-04', t), 'miss');
  assert.equal(dayStatus({ clean: true }, t, t), 'clean');
  assert.equal(dayStatus({ clean: false }, t, t), 'miss');
});

test('clean count and day index; misses never reduce the count', () => {
  const b = newBlock('2026-10-01');
  const days = {};
  for (let i = 0; i < 10; i++) days[addDays(b.startDate, i)] = { clean: true };
  days[addDays(b.startDate, 10)] = { clean: false };
  const s = blockSummary(b, days, addDays(b.startDate, 12));
  assert.equal(s.cleanDays, 10);
  assert.equal(s.dayIndex, 13);
  assert.equal(s.cells.filter((c) => c.status === 'miss').length, 2);
  assert.equal(s.cells.filter((c) => c.status === 'pending').length, 1);
  assert.equal(s.cells.filter((c) => c.status === 'future').length, 62);
});

test('day index clamps and ended flag flips the day after the block', () => {
  const b = newBlock('2026-01-01');
  assert.equal(blockSummary(b, {}, '2025-12-25').dayIndex, 0);
  assert.equal(blockSummary(b, {}, '2026-03-16').ended, false);
  assert.equal(blockSummary(b, {}, '2026-03-17').ended, true);
  assert.equal(blockSummary(b, {}, '2026-05-01').dayIndex, 75);
});

test('currentBlock picks the latest started block', () => {
  const a = newBlock('2026-01-01');
  const c = newBlock('2026-03-17');
  assert.equal(currentBlock([c, a], '2026-02-01').id, a.id);
  assert.equal(currentBlock([c, a], '2026-04-01').id, c.id);
  assert.equal(currentBlock([], '2026-04-01'), null);
});

test('totalCleanDays counts across blocks', () => {
  assert.equal(totalCleanDays({ a: { clean: true }, b: { clean: false }, c: { clean: true } }), 2);
});

test('block length is chosen per block and clamped to the limit', () => {
  assert.equal(newBlock('2026-10-02', 30).length, 30);
  assert.equal(blockDates(newBlock('2026-10-02', 30)).length, 30);
  assert.equal(newBlock('2026-10-02', 0).length, 1);
  assert.equal(newBlock('2026-10-02', 9999).length, 120);
  assert.equal(newBlock('2026-10-02', 'abc').length, 75);
});

test('streaks: longest run, and current run survives an unlogged today', () => {
  const days = {};
  for (const d of ['2026-10-02', '2026-10-03', '2026-10-04']) days[d] = { clean: true };
  days['2026-10-05'] = { clean: false };
  for (const d of ['2026-10-06', '2026-10-07']) days[d] = { clean: true };
  assert.deepEqual(streaks(days, '2026-10-07'), { current: 2, longest: 3 });
  assert.deepEqual(streaks(days, '2026-10-08'), { current: 2, longest: 3 });
  days['2026-10-08'] = { clean: false };
  assert.deepEqual(streaks(days, '2026-10-08'), { current: 0, longest: 3 });
  assert.deepEqual(streaks({}, '2026-10-08'), { current: 0, longest: 0 });
});
