import { state, save, wipe } from './db.js';
import { today, currentBlock, blockSummary, newBlock, formatDate, totalCleanDays, clampLength, QUESTION, RULES, BLOCK_DAYS, BLOCK_MAX } from './logic.js';
import { esc, on, reset } from './ui.js';

const root = document.getElementById('app');

let asking = false; // show the question even though today is logged
let which = false; // the "which rule" step
let settingUp = false; // choosing the next block

export function render() {
  reset(root);
  const t = today();
  const block = currentBlock(state.blocks, t);

  if (!block || settingUp) {
    root.innerHTML = setupHtml(block ? block.length : BLOCK_DAYS, t) + devHtml();
    on(root, 'submit', '#setup', async (e) => {
      e.preventDefault();
      const f = e.target;
      const start = /^\d{4}-\d{2}-\d{2}$/.test(f.start.value) ? f.start.value : t;
      state.blocks.push(newBlock(start, clampLength(f.days.value)));
      await save();
      settingUp = false;
      render();
    });
    if (block) on(root, 'click', '[data-act="back"]', () => { settingUp = false; render(); });
    devHandlers();
    return;
  }

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
    ${devHtml()}
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
  on(root, 'click', '[data-act="new-block"]', () => { settingUp = true; render(); });
  devHandlers();
}

function setupHtml(days, t) {
  return `
    <h1>How many days?</h1>
    <form id="setup" class="stack">
      <label class="field"><span>Days, up to ${BLOCK_MAX}</span><input type="number" name="days" value="${days}" min="1" max="${BLOCK_MAX}" inputmode="numeric" required></label>
      <label class="field"><span>Starts</span><input type="date" name="start" value="${t}" required></label>
      <button class="yes">Start</button>
      ${state.blocks.length ? `<p><button type="button" class="link" data-act="back">Back</button></p>` : ''}
    </form>
  `;
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

function devHtml() {
  return import.meta.env.DEV ? `<p class="foot muted"><button class="link" data-act="reset">Reset</button></p>` : '';
}
function devHandlers() {
  if (import.meta.env.DEV) on(root, 'click', '[data-act="reset"]', async () => { await wipe(); settingUp = false; render(); });
}

async function logDay(clean, brokenRule) {
  const t = today();
  const day = { date: t, clean };
  if (brokenRule) day.brokenRule = brokenRule;
  state.days[t] = day;
  await save();
  if (!state.meta.persistRequested && navigator.storage?.persist) {
    state.meta.persistRequested = true;
    try { await navigator.storage.persist(); } catch {}
    await save();
  }
  which = false;
  asking = false;
  render();
}
