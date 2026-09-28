import { state, save, wipe } from './db.js';
import { today, addDays, currentBlock, blockSummary, newBlock, formatDate, totalCleanDays, streaks, clampLength, QUESTION, BLOCK_DAYS, BLOCK_MAX } from './logic.js';
import { esc, on, reset } from './ui.js';

const root = document.getElementById('app');

let asking = false; // show the question again, for a wrong tap
let setup = null; // 'new' (first block, or next after one ends) | 'edit' (settings)

export function render() {
  reset(root);
  const t = today();
  const block = currentBlock(state.blocks, t);
  if (!block) setup = 'new';

  if (setup) {
    const src = setup === 'edit' ? block : { startDate: t, length: block ? block.length : BLOCK_DAYS };
    root.innerHTML = setupHtml(setup, src, !!block);
    on(root, 'submit', '#setup', async (e) => {
      e.preventDefault();
      const f = e.target;
      const start = /^\d{4}-\d{2}-\d{2}$/.test(f.start.value) ? f.start.value : t;
      const length = clampLength(f.days.value);
      if (setup === 'edit') {
        block.startDate = start;
        block.length = length;
      } else {
        state.blocks.push(newBlock(start, length));
      }
      await save();
      setup = null;
      render();
    });
    on(root, 'click', '[data-act="back"]', () => { setup = null; render(); });
    if (import.meta.env.DEV) on(root, 'click', '[data-act="reset"]', async () => { await wipe(); setup = null; render(); });
    return;
  }

  const s = blockSummary(block, state.days, t);
  const day = state.days[t];
  const logged = day && typeof day.clean === 'boolean';
  const lifetime = totalCleanDays(state.days);
  const run = streaks(state.days, t);
  const any = Object.keys(state.days).length > 0;

  root.innerHTML = `
    <p class="head"><span>Day <b>${s.dayIndex}</b> of ${block.length}</span><span><b>${s.cleanDays}</b> clean</span></p>
    <div class="grid" aria-label="Block">${s.cells.map((c) => `<i class="c ${c.status}${state.days[c.date]?.clean === false ? ' bad' : ''}" title="${formatDate(c.date)}"></i>`).join('')}</div>
    ${s.ended ? `<p>Block ended ${formatDate(s.end)}. <button class="link" data-act="new-block">Start another</button></p>` : ''}
    ${t < block.startDate ? `<section><p>Starts ${formatDate(block.startDate, { weekday: 'long', month: 'long', day: 'numeric' })}.</p></section>` : logged && !asking ? '' : `<section>${askHtml()}</section>`}
    <div class="foot muted">
      ${any ? `<p>Streak <b>${run.current}</b> · longest <b>${run.longest}</b></p>` : ''}
      ${lifetime !== s.cleanDays ? `<p>${lifetime} clean days overall</p>` : ''}
      ${logged && !asking ? `<p><button class="link" data-act="change">Edit</button></p>` : ''}
      <p><button class="link" data-act="settings">Settings</button></p>
    </div>
  `;

  on(root, 'click', '[data-answer="yes"]', () => logDay(true));
  on(root, 'click', '[data-answer="no"]', () => logDay(false));
  on(root, 'click', '[data-act="change"]', () => { asking = true; render(); });
  on(root, 'click', '[data-act="new-block"]', () => { setup = 'new'; render(); });
  on(root, 'click', '[data-act="settings"]', () => { setup = 'edit'; render(); });
}

function setupHtml(kind, src, canGoBack) {
  const links = [];
  if (canGoBack) links.push(`<button type="button" class="link" data-act="back">Back</button>`);
  if (import.meta.env.DEV) links.push(`<button type="button" class="link" data-act="reset">Reset</button>`);
  const first = kind === 'new' && !canGoBack;
  return `
    ${first ? introHtml() : `<h1>${kind === 'edit' ? 'Settings' : 'Next block'}</h1>`}
    <form id="setup" class="stack">
      <div class="row">
        <label class="field"><span>Days, up to ${BLOCK_MAX}</span><input type="number" name="days" value="${src.length}" min="1" max="${BLOCK_MAX}" inputmode="numeric" required></label>
        <label class="field"><span>Starts</span><input type="date" name="start" value="${src.startDate}" required></label>
      </div>
      <button class="yes">${kind === 'edit' ? 'Save' : 'Start'}</button>
      ${links.length ? `<p>${links.join(' · ')}</p>` : ''}
    </form>
  `;
}

// Shown once, above the first setup form.
function introHtml() {
  return `
    <div class="intro">
      <h1>Change</h1>
      ${sampleHtml()}
      <p>Every night: ${esc(QUESTION.charAt(0).toLowerCase() + QUESTION.slice(1))}</p>
    </div>
  `;
}

// A made-up block, day 40 of 75, with a few slips. g clean, r no, . skipped.
function sampleHtml() {
  const pattern = 'gggggggrgggg.ggggggrgggggggggggg.ggggrg';
  const start = '2026-10-02';
  const days = {};
  [...pattern].forEach((ch, i) => {
    if (ch !== '.') days[addDays(start, i)] = { clean: ch === 'g' };
  });
  const t = addDays(start, pattern.length);
  const block = newBlock(start);
  const s = blockSummary(block, days, t);
  const run = streaks(days, t);
  return `
    <div class="sample" aria-hidden="true">
      <p class="head muted"><span>Day <b>${s.dayIndex}</b> of ${block.length}</span><span><b>${s.cleanDays}</b> clean</span></p>
      <div class="grid">${s.cells.map((c) => `<i class="c ${c.status}${days[c.date]?.clean === false ? ' bad' : ''}"></i>`).join('')}</div>
      <p class="muted">Streak <b>${run.current}</b> · longest <b>${run.longest}</b></p>
    </div>
  `;
}

function askHtml() {
  return `
    <h1>${esc(QUESTION)}</h1>
    <div class="row">
      <button data-answer="no">No</button>
      <button class="yes" data-answer="yes">Yes</button>
    </div>
  `;
}

async function logDay(clean) {
  const t = today();
  state.days[t] = { date: t, clean };
  await save();
  if (!state.meta.persistRequested && navigator.storage?.persist) {
    state.meta.persistRequested = true;
    try { await navigator.storage.persist(); } catch {}
    await save();
  }
  asking = false;
  render();
}
