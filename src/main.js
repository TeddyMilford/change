import './style.css';
import { registerSW } from 'virtual:pwa-register';
import { load, ensureBlock } from './db.js';
import { install as installSync } from './sync.js';
import { render } from './screen.js';

async function boot() {
  registerSW({ immediate: true });
  await load();
  installSync();
  await ensureBlock();
  render();
  // Reopened the next day: the date moved on, redraw.
  document.addEventListener('visibilitychange', async () => {
    if (document.hidden) return;
    await ensureBlock();
    render();
  });
}

boot();
