export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function $(sel, root = document) {
  return root.querySelector(sel);
}

// Delegated listeners tied to the current render. reset(root) drops the previous render's.
const controllers = new WeakMap();
export function reset(root) {
  controllers.get(root)?.abort();
  controllers.set(root, new AbortController());
}
export function on(root, event, selector, handler) {
  if (!controllers.has(root)) reset(root);
  root.addEventListener(event, (e) => {
    const target = e.target.closest(selector);
    if (target && root.contains(target)) handler(e, target);
  }, { signal: controllers.get(root).signal });
}
