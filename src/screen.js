import { state, save, hasData, restore, wipe } from './db.js';
import { today, currentBlock, blockSummary, newBlock, formatDate, totalCleanDays, QUESTION, RULES } from './logic.js';
import { status, onStatus, connect, disconnect, push, pull } from './sync.js';
import { esc, $, on, reset } from './ui.js';

const root = document.getElementById('app');

let asking = false; // show the question even though today is logged
let which = false; // the "which rule" step

export function render() {
  reset(root);
  const t = today();
  const block = currentBlock(state.blocks, t);
  const s = blockSummary(block, state.days, t);
  const day = state.days[t];
  const logged = day && typeof day.clean === 'boolean';
  const lifetime = totalCleanDays(state.days);

  root.innerHTML = `
    <p class="head"><span>Day <b>${s.dayIndex}</b> of ${block.length}</span><span><b>${s.cleanDays}</b> clean</span></p>
    <div class="grid" aria-label="Block">${s.cells.map((c) => `<i class="c ${c.status}${state.days[c.date]?.clean === false ? ' bad' : ''}" title="${formatDate(c.date)}"></i>`).join('')}</div>
    ${s.ended ? `<p>Block ended ${formatDate(s.end)}. <button class="link" data-act="new-block">Start another</button></p>` : ''}
    <section>${t < block.startDate ? `<p>Starts ${formatDate(block.startDate, { weekday: 'long', month: 'long', day: 'numeric' })}.</p>` : which ? whichHtml() : logged && !asking ? loggedHtml(day) : askHtml()}</section>
    ${lifetime !== s.cleanDays ? `<p class="muted">${lifetime} clean days overall</p>` : ''}
    <p class="foot muted">${footHtml()}</p>
    ${import.meta.env.DEV ? `<p class="foot muted"><button class="link" data-act="reset">Reset</button></p>` : ''}
  `;

  on(root, 'click', '[data-answer="yes"]', () => logDay(true));
  on(root, 'click', '[data-answer="no"]', () => { which = true; render(); });
  on(root, 'click', '[data-rule]', (e, el) => {
    const v = el.dataset.rule;
    logDay(false, v === 'skip' ? undefined : RULES[Number(v)]);
  });
  on(root, 'submit', '#other', (e) => {
    e.preventDefault();
    logDay(false, e.target.text.value.trim() || undefined);
  });
  on(root, 'click', '[data-act="back"]', () => { which = false; render(); });
  on(root, 'click', '[data-act="change"]', () => { asking = true; render(); });
  on(root, 'click', '[data-act="new-block"]', async () => {
    state.blocks.push(newBlock(t));
    await save();
    render();
  });
  on(root, 'click', '[data-act="setup"]', setup);
  on(root, 'click', '[data-act="push"]', () => push().catch(() => {}));
  if (import.meta.env.DEV) on(root, 'click', '[data-act="reset"]', async () => { await wipe(); render(); });
}

function askHtml() {
  return `
    <h1>${esc(QUESTION)}</h1>
    <div class="row">
      <button class="yes" data-answer="yes">Yes</button>
      <button data-answer="no">No</button>
    </div>
    <ol class="rules">${RULES.map((r) => `<li>${esc(r)}</li>`).join('')}</ol>
  `;
}

function whichHtml() {
  return `
    <h1>Which rule?</h1>
    <div class="stack">
      ${RULES.map((r, i) => `<button data-rule="${i}">${esc(r)}</button>`).join('')}
      <form id="other"><input type="text" name="text" placeholder="Other" autocomplete="off"><button>Log</button></form>
      <p><button class="link" data-rule="skip">Skip</button> · <button class="link" data-act="back">Back</button></p>
    </div>
  `;
}

function loggedHtml(day) {
  return `<p>Today: ${day.clean ? 'clean' : 'not clean'}${day.brokenRule ? `, ${esc(day.brokenRule)}` : ''}. <button class="link" data-act="change">Change</button></p>`;
}

function footHtml() {
  if (!state.settings.gistToken) return `<button class="link" data-act="setup">Backup off</button>`;
  const change = `<button class="link" data-act="setup">change</button>`;
  switch (status.state) {
    case 'syncing': return 'Backing up';
    case 'error': return `Backup failed. <button class="link" data-act="push">Retry</button> · ${change}`;
    case 'ok': return `Backed up ${new Date(status.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} · ${change}`;
    default: return `Backup on · ${change}`;
  }
}

onStatus(() => {
  const el = $('.foot', root);
  if (el) el.innerHTML = footHtml();
});

async function logDay(clean, brokenRule) {
  const t = today();
  const day = { date: t, clean };
  if (brokenRule) day.brokenRule = brokenRule;
  state.days[t] = day;
  await save();
  if (!state.meta.persistRequested && navigator.storage?.persist) {
    state.meta.persistRequested = true;
    try { await navigator.storage.persist(); } catch {}
    await save({ silent: true });
  }
  which = false;
  asking = false;
  render();
}

// Backup goes to a private gist. Token needs the gist scope. One prompt, stored on the device.
async function setup() {
  const input = prompt('GitHub token with the gist scope. Blank turns backup off.', state.settings.gistToken);
  if (input === null) return;
  const token = input.trim();
  try {
    if (!token) {
      await disconnect();
    } else if (token === state.settings.gistToken) {
      await push();
    } else {
      const found = await connect(token);
      if (found && confirm(hasData()
        ? 'A backup exists. Load it here? Cancel keeps this device’s data and overwrites the backup.'
        : 'A backup exists. Load it here?')) {
        await restore(await pull());
      }
      await push();
    }
  } catch (e) {
    alert('Backup failed: ' + e.message);
  }
  render();
}
