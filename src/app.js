import { saveSession, loadSession, clearSession } from './db.js';
import { parseJSONL } from './parser.js';
import { renderTurns, scrollToTurn } from './renderer.js';
import { buildIndex, initSearchUI } from './search.js';

const chatContainer = document.getElementById('chat-container');
const fileInput = document.getElementById('file-input');
const searchInput = document.getElementById('search-input');
const searchOverlay = document.getElementById('search-overlay');
const dbWarning = document.getElementById('db-warning');

function loadAndRender(rawText) {
  chatContainer.innerHTML = '';
  document.getElementById('empty-state')?.remove();
  const turns = parseJSONL(rawText);
  renderTurns(turns, chatContainer);
  const index = buildIndex(turns);
  initSearchUI(index, searchInput, searchOverlay, scrollToTurn);
}

async function init() {
  try {
    const rawText = await loadSession();
    if (rawText) loadAndRender(rawText);
  } catch {
    if (dbWarning) dbWarning.hidden = false;
  }

  fileInput.addEventListener('change', async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    const rawText = await file.text();
    try {
      await clearSession();
      await saveSession(rawText);
    } catch {
      if (dbWarning) dbWarning.hidden = false;
    }
    loadAndRender(rawText);
    fileInput.value = '';
  });
}

document.addEventListener('DOMContentLoaded', init);
