// Shared high-score storage for the games dashboard.
// Each game writes its best result via GD.record(...). The dashboard reads
// the values back with GD.best(...) / GD.all() to render badges.
//
// Storage layout: localStorage["gd.best.<gameId>"] = JSON({ value, kind })
//   kind: 'score' = higher is better, 'time' = lower is better
//
// Usage:
//   GD.record('snake', 42, 'score');
//   GD.record('pit-lane', 9.87, 'time');
//   GD.best('snake');                  // -> { value: 42, kind: 'score' }
//   GD.all();                          // -> { snake: {...}, 'pit-lane': {...} }
//   GD.format({ value: 9.87, kind: 'time' });  // -> '9.87s'
(() => {
  const KEY_PREFIX = 'gd.best.';

  function load(gameId) {
    try {
      const raw = localStorage.getItem(KEY_PREFIX + gameId);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj || typeof obj !== 'object') return null;
      if (typeof obj.value !== 'number' || !Number.isFinite(obj.value)) return null;
      if (obj.kind !== 'score' && obj.kind !== 'time') return null;
      return obj;
    } catch { return null; }
  }

  function save(gameId, entry) {
    try { localStorage.setItem(KEY_PREFIX + gameId, JSON.stringify(entry)); } catch {}
  }

  function record(gameId, value, kind) {
    if (!gameId || typeof value !== 'number' || !Number.isFinite(value)) return false;
    if (kind !== 'score' && kind !== 'time') return false;
    const cur = load(gameId);
    const better = !cur || (kind === 'score' ? value > cur.value : value < cur.value);
    if (better) { save(gameId, { value, kind }); return true; }
    return false;
  }

  function best(gameId) { return load(gameId); }

  function all() {
    const out = {};
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith(KEY_PREFIX)) continue;
        const gameId = key.slice(KEY_PREFIX.length);
        const v = load(gameId);
        if (v) out[gameId] = v;
      }
    } catch {}
    return out;
  }

  function format(entry) {
    if (!entry) return '';
    if (entry.kind === 'time') return `${entry.value.toFixed(2)}s`;
    if (Math.abs(entry.value - Math.round(entry.value)) < 1e-9) return String(Math.round(entry.value));
    return entry.value.toFixed(2);
  }

  window.GD = { record, best, all, format };
})();
