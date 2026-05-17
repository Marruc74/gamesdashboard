(() => {
  const grid = document.getElementById('grid');

  async function discoverFolders() {
    try {
      const res = await fetch('games/', { headers: { Accept: 'text/html' } });
      if (!res.ok) throw new Error(`games/ returned ${res.status}`);
      const html = await res.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const folders = Array.from(doc.querySelectorAll('a'))
        .map(a => a.getAttribute('href') || '')
        .map(h => decodeURIComponent(h))
        .filter(h => h.endsWith('/'))
        .filter(h => !h.startsWith('/') && !h.startsWith('?') && !h.startsWith('http'))
        .filter(h => h !== '../' && h !== './')
        .map(h => h.replace(/\/+$/, ''))
        .filter(Boolean)
        .filter(h => !h.startsWith('_'));
      if (folders.length) return [...new Set(folders)];
    } catch (e) {
      console.warn('Directory listing failed, trying manifest.json', e);
    }

    try {
      const res = await fetch('games/manifest.json');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) return data;
      }
    } catch {}

    return null;
  }

  async function loadGame(folder) {
    try {
      const res = await fetch(`games/${folder}/game.json`);
      if (!res.ok) return null;
      const data = await res.json();
      return {
        folder,
        title: data.title || folder,
        description: data.description || '',
        tag: data.tag || '',
        color: data.color || '#7c5cff',
        icon: data.icon || folder[0]?.toUpperCase() || '?',
        thumb: data.thumb || null,
        entry: data.entry || 'index.html',
        order: typeof data.order === 'number' ? data.order : 999,
      };
    } catch {
      return null;
    }
  }

  function renderCard(game) {
    const a = document.createElement('a');
    a.className = 'card';
    a.href = `games/${game.folder}/${game.entry}`;
    a.style.setProperty('--card-color', game.color);

    const thumb = document.createElement('div');
    thumb.className = 'thumb';
    if (game.thumb) {
      const img = document.createElement('img');
      img.className = 'thumb-img';
      img.src = `games/${game.folder}/${game.thumb}`;
      img.alt = '';
      thumb.appendChild(img);
    } else {
      const icon = document.createElement('div');
      icon.className = 'thumb-icon';
      icon.textContent = game.icon;
      thumb.appendChild(icon);
    }

    const body = document.createElement('div');
    body.className = 'card-body';
    const h2 = document.createElement('h2');
    h2.textContent = game.title;
    const p = document.createElement('p');
    p.textContent = game.description;
    body.appendChild(h2);
    body.appendChild(p);
    if (game.tag) {
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = game.tag;
      body.appendChild(tag);
    }

    const best = window.GD && window.GD.best ? window.GD.best(game.folder) : null;
    if (best) {
      const badge = document.createElement('span');
      badge.className = 'best-badge';
      const icon = best.kind === 'time' ? '⏱' : '🏆';
      badge.textContent = `${icon} ${window.GD.format(best)}`;
      body.appendChild(badge);
    } else {
      const newBadge = document.createElement('span');
      newBadge.className = 'new-badge';
      newBadge.textContent = 'NEW';
      body.appendChild(newBadge);
    }

    a.appendChild(thumb);
    a.appendChild(body);
    return a;
  }

  function updateHeroStats(games) {
    const totalEl = document.getElementById('stat-total');
    const bestEl = document.getElementById('stat-best');
    const newEl = document.getElementById('stat-new');
    if (!totalEl) return;
    let bestCount = 0;
    if (window.GD && window.GD.best) {
      for (const g of games) if (window.GD.best(g.folder)) bestCount++;
    }
    totalEl.textContent = games.length;
    if (bestEl) bestEl.textContent = bestCount;
    if (newEl) newEl.textContent = games.length - bestCount;
  }

  function showError(msg) {
    grid.innerHTML = '';
    const div = document.createElement('div');
    div.className = 'error';
    div.innerHTML = msg;
    grid.appendChild(div);
  }

  async function init() {
    if (location.protocol === 'file:') {
      showError(
        '<strong>Open via a local server, not file://</strong><br>' +
        'Browsers block <code>fetch()</code> on <code>file://</code>. From this folder run:<br>' +
        '<code>python -m http.server 8000</code> &nbsp;or&nbsp; <code>npx serve</code><br>' +
        'then open <code>http://localhost:8000</code>.'
      );
      return;
    }

    const folders = await discoverFolders();
    if (!folders) {
      showError(
        '<strong>Could not list games.</strong> ' +
        'Your server may have directory listing disabled. ' +
        'Create a <code>games/manifest.json</code> with an array of folder names, e.g. <code>["snake", "tic-tac-toe"]</code>.'
      );
      return;
    }

    if (folders.length === 0) {
      grid.innerHTML = '<p class="empty">No games yet. Drop a folder in <code>games/</code>.</p>';
      return;
    }

    const games = (await Promise.all(folders.map(loadGame))).filter(Boolean);
    games.sort((a, b) => a.title.localeCompare(b.title));

    grid.innerHTML = '';
    if (games.length === 0) {
      grid.innerHTML = '<p class="empty">Found folders but no <code>game.json</code> files inside them.</p>';
      return;
    }
    games.forEach(g => grid.appendChild(renderCard(g)));
    updateHeroStats(games);
  }

  init();
})();
