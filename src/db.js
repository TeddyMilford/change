import { getMany, setMany, clear } from 'idb-keyval';
import { today, newBlock, currentBlock, START } from './logic.js';

export const KEYS = ['blocks', 'days', 'settings', 'meta'];
const LS = 'runway:settings'; // mirror, so a wiped IndexedDB can still find the backup

function defaults() {
  return {
    blocks: [],
    days: {},
    settings: { gistToken: '', gistId: '' },
    meta: { persistRequested: false, updatedAt: null },
  };
}

export const state = defaults();

const saveHooks = new Set();
export function afterSave(fn) {
  saveHooks.add(fn);
}

function validBlocks(list) {
  return (list || []).filter((b) => b && typeof b.startDate === 'string' && Number.isInteger(b.length));
}
function validDays(obj) {
  return Object.fromEntries(Object.entries(obj || {}).filter(([, v]) => v && typeof v.clean === 'boolean'));
}

export async function load() {
  let values = [];
  try {
    values = await getMany(KEYS);
  } catch (e) {
    console.warn('IndexedDB unavailable', e);
  }
  KEYS.forEach((k, i) => {
    if (values[i] != null) state[k] = values[i];
  });
  const d = defaults();
  state.settings = { ...d.settings, ...state.settings };
  state.meta = { ...d.meta, ...state.meta };
  state.blocks = validBlocks(state.blocks);
  state.days = validDays(state.days);
  if (!state.settings.gistToken) {
    try {
      Object.assign(state.settings, JSON.parse(localStorage.getItem(LS) || '{}'));
    } catch {}
  }
  return state;
}

export function hasData() {
  return Object.keys(state.days).length > 0;
}

// silent: skip the after-save hooks (no backup push)
export async function save({ silent = false } = {}) {
  state.meta.updatedAt = new Date().toISOString();
  try {
    await setMany(KEYS.map((k) => [k, state[k]]));
  } catch (e) {
    console.warn('save failed', e);
  }
  try {
    localStorage.setItem(LS, JSON.stringify(state.settings));
  } catch {}
  if (!silent) for (const fn of saveHooks) fn();
}

export async function ensureBlock() {
  if (currentBlock(state.blocks, today())) return;
  state.blocks.push(newBlock(state.blocks.length ? today() : START));
  await save();
}

// Full JSON snapshot. No settings, so no token.
export function snapshot() {
  return {
    app: 'runway',
    version: 3,
    exportedAt: new Date().toISOString(),
    blocks: state.blocks,
    days: state.days,
    meta: state.meta,
  };
}

export function validateSnapshot(obj) {
  if (!obj || typeof obj !== 'object') return 'Not an object';
  if (obj.app !== 'runway') return 'Not a Runway backup';
  if (!Array.isArray(obj.blocks) || !obj.days || typeof obj.days !== 'object') return 'Missing blocks or days';
  return null;
}

// Replace local data with a snapshot. Keeps local settings.
export async function restore(obj) {
  const err = validateSnapshot(obj);
  if (err) throw new Error(err);
  state.blocks = validBlocks(obj.blocks);
  state.days = validDays(obj.days);
  state.meta = { ...defaults().meta, ...(obj.meta || {}) };
  await save({ silent: true });
  await ensureBlock();
}

// Dev only. Drops everything on this device, including the backup token.
export async function wipe() {
  try { await clear(); } catch {}
  try { localStorage.removeItem(LS); } catch {}
  Object.assign(state, defaults());
  await ensureBlock();
}
