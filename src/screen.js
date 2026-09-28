import { state, save } from './db.js';
import { today, addDays, currentBlock, blockSummary, newBlock, formatDate, totalCleanDays, streaks, QUESTION } from './logic.js';
import { esc, on, reset } from './ui.js';

const root = document.getElementById('app');

let asking = false; // show the question again, for a wrong tap
export function render() {
  reset(root);
  const t = today();
  const block = currentBlock(state.blocks, t);

  if (!block) {
    root.innerHTML = introHtml();
    on(root, 'click', '[data-act="start"]', async () => {
      state.blocks.push(newBlock(t));
      await save();
      render();
    });
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
    </div>
  `;

  on(root, 'click', '[data-answer="yes"]', () => logDay(true));
  on(root, 'click', '[data-answer="no"]', () => logDay(false));
  on(root, 'click', '[data-act="change"]', () => { asking = true; render(); });
  on(root, 'click', '[data-act="new-block"]', async () => {
    state.blocks.push(newBlock(t, block.length));
    await save();
    render();
  });
}

// First run. Start begins a default-length block today.
function introHtml() {
  return `
    <div class="intro">
      <h1>Change</h1>
      ${sampleHtml()}
    </div>
    <button class="yes wide" data-act="start">Start</button>
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
