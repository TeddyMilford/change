import { state, snapshot, afterSave, save } from './db.js';

const API = 'https://api.github.com/gists';
const FILE = 'runway.json';

// 'idle' | 'syncing' | 'ok' | 'error'
export const status = { state: 'idle', at: null, message: '' };
const listeners = new Set();
export function onStatus(fn) {
  listeners.add(fn);
}
function set(s, message = '') {
  status.state = s;
  status.message = message;
  if (s === 'ok') status.at = new Date().toISOString();
  for (const fn of listeners) fn(status);
}

function headers(token) {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  };
}

async function request(method, url, body, token = state.settings.gistToken) {
  const res = await fetch(url, { method, headers: headers(token), body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { msg += ': ' + (await res.json()).message; } catch {}
    throw new Error(msg);
  }
  return res.json();
}

// The user's existing backup gist, if there is one.
async function findGist(token) {
  const list = await request('GET', `${API}?per_page=100`, undefined, token);
  const g = list.find((g) => g.files && g.files[FILE]);
  return g ? g.id : '';
}

// Store the token and attach to the existing backup gist. Returns its id, or '' if none yet.
export async function connect(token) {
  const id = await findGist(token);
  state.settings.gistToken = token;
  state.settings.gistId = id;
  await save({ silent: true });
  return id;
}

export async function disconnect() {
  state.settings.gistToken = '';
  state.settings.gistId = '';
  await save({ silent: true });
  set('idle');
}

let timer = null;
let inFlight = null;
let dirty = false;

// Write the full snapshot to the gist. Creates a private gist the first time.
export async function push() {
  if (!state.settings.gistToken) return null;
  if (inFlight) {
    dirty = true;
    return inFlight;
  }
  set('syncing');
  inFlight = (async () => {
    try {
      const files = { [FILE]: { content: JSON.stringify(snapshot(), null, 2) } };
      if (state.settings.gistId) {
        await request('PATCH', `${API}/${state.settings.gistId}`, { files });
      } else {
        const data = await request('POST', API, { description: 'Runway backup', public: false, files });
        state.settings.gistId = data.id;
        await save({ silent: true });
      }
      set('ok');
    } catch (e) {
      set('error', e.message || String(e));
      throw e;
    } finally {
      inFlight = null;
      if (dirty) {
        dirty = false;
        schedule();
      }
    }
  })();
  return inFlight;
}

export async function pull() {
  if (!state.settings.gistId) throw new Error('No backup gist');
  const data = await request('GET', `${API}/${state.settings.gistId}`);
  const f = data.files?.[FILE];
  if (!f) throw new Error(`Gist has no ${FILE}`);
  let content = f.content;
  if (f.truncated && f.raw_url) content = await (await fetch(f.raw_url)).text();
  return JSON.parse(content);
}

export function schedule() {
  if (!state.settings.gistToken) return;
  clearTimeout(timer);
  timer = setTimeout(() => push().catch(() => {}), 1500);
}

export function install() {
  afterSave(schedule);
  window.addEventListener('online', () => {
    if (status.state === 'error') schedule();
  });
}
