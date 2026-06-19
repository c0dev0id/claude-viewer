function escapeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function buildIndex(turns) {
  const entries = [];
  for (const turn of turns) {
    if (turn.userText) entries.push({ turnId: turn.id, text: turn.userText, side: 'user' });
    const assistantText = turn.segments
      .filter(s => s.type === 'text')
      .map(s => s.content)
      .join('\n');
    if (assistantText) entries.push({ turnId: turn.id, text: assistantText, side: 'assistant' });
  }
  return { entries };
}

export function query(index, term) {
  if (!term || term.length < 2) return [];
  const lower = term.toLowerCase();
  const results = [];
  for (const entry of index.entries) {
    const lowerText = entry.text.toLowerCase();
    const pos = lowerText.indexOf(lower);
    if (pos === -1) continue;
    const start = Math.max(0, pos - 50);
    const end = Math.min(entry.text.length, pos + lower.length + 50);
    const before = escapeHTML(entry.text.slice(start, pos));
    const match = escapeHTML(entry.text.slice(pos, pos + lower.length));
    const after = escapeHTML(entry.text.slice(pos + lower.length, end));
    const excerpt =
      (start > 0 ? '\u2026' : '') +
      before +
      `<mark>${match}</mark>` +
      after +
      (end < entry.text.length ? '\u2026' : '');
    results.push({ turnId: entry.turnId, excerpt, side: entry.side });
    if (results.length >= 50) break;
  }
  return results;
}

export function initSearchUI(index, inputEl, overlayEl, onSelect) {
  if (inputEl._searchAbort) inputEl._searchAbort.abort();
  const ac = new AbortController();
  inputEl._searchAbort = ac;
  const sig = { signal: ac.signal };

  let debounceTimer = null;
  let focusIndex = -1;

  const resultsList = overlayEl.querySelector('.search-results');

  function hideOverlay() {
    overlayEl.hidden = true;
    resultsList.innerHTML = '';
    focusIndex = -1;
  }

  function moveFocus(delta) {
    const items = resultsList.querySelectorAll('.search-result');
    if (!items.length) return;
    focusIndex = Math.max(0, Math.min(items.length - 1, focusIndex + delta));
    items[focusIndex].focus();
  }

  function renderResults(results) {
    resultsList.innerHTML = '';
    focusIndex = -1;

    if (results.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'no-results';
      empty.textContent = 'No results';
      resultsList.appendChild(empty);
      overlayEl.hidden = false;
      return;
    }

    for (const r of results) {
      const item = document.createElement('div');
      item.className = 'search-result';
      item.tabIndex = 0;
      item.innerHTML =
        `<span class="result-side">${r.side === 'user' ? 'You' : 'Assistant'}</span>` +
        `<span class="result-excerpt">${r.excerpt}</span>`;
      item.addEventListener('click', () => {
        hideOverlay();
        inputEl.value = '';
        onSelect(r.turnId);
      });
      item.addEventListener('keydown', e => {
        if (e.key === 'Enter') item.click();
      });
      resultsList.appendChild(item);
    }
    overlayEl.hidden = false;
  }

  inputEl.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const term = inputEl.value.trim();
      if (term.length < 2) { hideOverlay(); return; }
      renderResults(query(index, term));
    }, 150);
  }, sig);

  inputEl.addEventListener('keydown', e => {
    if (e.key === 'Escape') { hideOverlay(); inputEl.value = ''; }
    else if (e.key === 'ArrowDown') { e.preventDefault(); moveFocus(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); moveFocus(-1); }
  }, sig);

  overlayEl.addEventListener('keydown', e => {
    if (e.key === 'Escape') { hideOverlay(); inputEl.value = ''; inputEl.focus(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); moveFocus(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); moveFocus(-1); }
  }, sig);

  overlayEl.addEventListener('click', e => {
    if (e.target === overlayEl) hideOverlay();
  }, sig);
}
