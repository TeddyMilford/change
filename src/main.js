import './style.css';
import { registerSW } from 'virtual:pwa-register';
import { load } from './db.js';
import { render } from './screen.js';

async function boot() {
  registerSW({ immediate: true });
  await load();
  render();
  // Reopened the next day: the date moved on, redraw.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) render();
  });
}

boot();
