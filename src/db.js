import { getMany, setMany, clear } from 'idb-keyval';

export const KEYS = ['blocks', 'days', 'meta'];

function defaults() {
  return {
    blocks: [],
    days: {},
    meta: { persistRequested: false, updatedAt: null },
  };
}

export const state = defaults();

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
  state.meta = { ...defaults().meta, ...state.meta };
  state.blocks = (state.blocks || []).filter((b) => b && typeof b.startDate === 'string' && Number.isInteger(b.length));
  state.days = Object.fromEntries(Object.entries(state.days || {}).filter(([, v]) => v && typeof v.clean === 'boolean'));
  return state;
}

export async function save() {
  state.meta.updatedAt = new Date().toISOString();
  try {
    await setMany(KEYS.map((k) => [k, state[k]]));
  } catch (e) {
    console.warn('save failed', e);
  }
}

// Drops everything on this device.
export async function wipe() {
  try { await clear(); } catch {}
  Object.assign(state, defaults());
}
