let _allTurns = [];
let _renderedCount = 0;
let _container = null;
let _observer = null;
const BATCH_SIZE = 100;

function buildPillEl(meta) {
  const wrapper = document.createElement('div');
  wrapper.className = 'pill-wrapper';

  const hasDetail = meta.detail != null && String(meta.detail).trim().length > 0;

  if (!hasDetail) {
    const span = document.createElement('span');
    span.className = 'pill pill-static';
    span.textContent = meta.label;
    wrapper.appendChild(span);
    return wrapper;
  }

  const btn = document.createElement('button');
  btn.className = 'pill';
  btn.textContent = meta.label;
  btn.setAttribute('aria-expanded', 'false');

  const detail = document.createElement('pre');
  detail.className = 'pill-detail';
  detail.hidden = true;
  detail.textContent = meta.detail;

  btn.addEventListener('click', () => {
    const willExpand = detail.hidden;
    detail.hidden = !willExpand;
    btn.setAttribute('aria-expanded', String(willExpand));
  });

  wrapper.appendChild(btn);
  wrapper.appendChild(detail);
  return wrapper;
}

function buildTurnEl(turn) {
  const el = document.createElement('div');
  el.className = 'turn';
  el.id = turn.id;

  if (turn.userText) {
    const bubble = document.createElement('div');
    bubble.className = 'bubble bubble-user';
    const p = document.createElement('p');
    p.textContent = turn.userText;
    bubble.appendChild(p);
    el.appendChild(bubble);
  }

  if (turn.metaItems.length > 0) {
    const row = document.createElement('div');
    row.className = 'pills-row';
    for (const meta of turn.metaItems) {
      row.appendChild(buildPillEl(meta));
    }
    el.appendChild(row);
  }

  if (turn.assistantText) {
    const bubble = document.createElement('div');
    bubble.className = 'bubble bubble-assistant';
    bubble.innerHTML = window.marked.parse(turn.assistantText);
    el.appendChild(bubble);
  }

  return el;
}

function renderBatch() {
  const end = Math.min(_renderedCount + BATCH_SIZE, _allTurns.length);
  const frag = document.createDocumentFragment();
  for (let i = _renderedCount; i < end; i++) {
    frag.appendChild(buildTurnEl(_allTurns[i]));
  }
  _container.appendChild(frag);
  _renderedCount = end;
}

function setupSentinel() {
  const sentinel = document.createElement('div');
  sentinel.id = 'render-sentinel';
  _container.appendChild(sentinel);

  _observer = new IntersectionObserver(entries => {
    if (entries[0].isIntersecting) {
      sentinel.remove();
      _observer.disconnect();
      renderBatch();
      if (_renderedCount < _allTurns.length) setupSentinel();
    }
  });
  _observer.observe(sentinel);
}

export function renderTurns(turns, container) {
  _allTurns = turns;
  _renderedCount = 0;
  _container = container;

  if (_observer) _observer.disconnect();
  document.getElementById('render-sentinel')?.remove();

  renderBatch();
  if (_renderedCount < _allTurns.length) setupSentinel();
}

export function scrollToTurn(turnId) {
  const index = parseInt(turnId.replace('turn-', ''), 10);
  if (!isNaN(index) && index >= _renderedCount) {
    if (_observer) { _observer.disconnect(); _observer = null; }
    document.getElementById('render-sentinel')?.remove();
    const frag = document.createDocumentFragment();
    for (let i = _renderedCount; i <= index; i++) {
      frag.appendChild(buildTurnEl(_allTurns[i]));
    }
    _container.appendChild(frag);
    _renderedCount = index + 1;
    if (_renderedCount < _allTurns.length) setupSentinel();
  }
  document.getElementById(turnId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
