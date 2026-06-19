function extractUserText(content) {
  if (typeof content === 'string') return content.trim() || null;
  if (!Array.isArray(content)) return null;
  const parts = content
    .filter(b => b?.type === 'text')
    .map(b => b.text ?? '')
    .join('\n')
    .trim();
  return parts || null;
}

function extractToolResults(content) {
  if (!Array.isArray(content)) return [];
  return content.filter(b => b?.type === 'tool_result');
}

function toolUseLabel(block) {
  const name = block.name ?? 'tool';
  const input = block.input ?? {};
  const val = Object.values(input)[0];
  const hint = val !== undefined ? String(val).slice(0, 60) : '';
  return `\u{1F527} ${name}${hint ? ' ' + hint : ''}`;
}

export function parseJSONL(rawText) {
  const events = [];
  for (const line of rawText.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      events.push(JSON.parse(trimmed));
    } catch {
      console.warn('JSONL parse: skipping bad line:', trimmed.slice(0, 80));
    }
  }

  const turns = [];
  let current = null;
  const toolResultMap = {};

  function pushCurrent() {
    if (current) turns.push(current);
    current = null;
  }

  function ensureCurrent() {
    if (!current) {
      current = { id: `turn-${turns.length}`, userText: null, metaItems: [], assistantText: null };
    }
  }

  for (const ev of events) {
    switch (ev?.type) {
      case 'user': {
        const content = ev.message?.content;
        const userText = extractUserText(content);
        const toolResults = extractToolResults(content);

        for (const tr of toolResults) {
          if (tr.tool_use_id) {
            const txt = typeof tr.content === 'string' ? tr.content : JSON.stringify(tr.content ?? '');
            toolResultMap[tr.tool_use_id] = txt;
          }
        }

        if (userText) {
          pushCurrent();
          current = { id: `turn-${turns.length}`, userText, metaItems: [], assistantText: null };
        }
        break;
      }

      case 'assistant': {
        ensureCurrent();
        for (const block of ev.message?.content ?? []) {
          if (block?.type === 'text') {
            current.assistantText = (current.assistantText ?? '') + block.text;
          } else if (block?.type === 'tool_use') {
            current.metaItems.push({
              kind: 'tool_use',
              label: toolUseLabel(block),
              detail: JSON.stringify(block.input ?? {}, null, 2),
              _toolUseId: block.id,
            });
          } else if (block?.type === 'thinking') {
            const len = (block.thinking ?? '').length;
            current.metaItems.push({
              kind: 'thinking',
              label: `\u{1F4AD} Thinking (${len} chars)`,
              detail: block.thinking ?? '',
            });
          }
        }
        break;
      }

      case 'attachment': {
        ensureCurrent();
        const a = ev.attachment ?? {};
        const label = `\u{1F4CE} ${a.type ?? 'attachment'}${a.hookName ? ' \u00B7 ' + a.hookName : ''}`;
        const detail = a.content ?? a.stdout ?? JSON.stringify(a, null, 2);
        current.metaItems.push({ kind: 'attachment', label, detail });
        break;
      }

      case 'system': {
        ensureCurrent();
        const label = `\u2699\uFE0F system${ev.subtype ? ': ' + ev.subtype : ''}`;
        current.metaItems.push({ kind: 'system', label, detail: JSON.stringify(ev, null, 2) });
        break;
      }

      default:
        break;
    }
  }
  pushCurrent();

  // Stitch tool results onto their originating tool_use MetaItems
  for (const turn of turns) {
    for (const meta of turn.metaItems) {
      if (meta.kind === 'tool_use' && meta._toolUseId) {
        meta.toolResultText = toolResultMap[meta._toolUseId];
        delete meta._toolUseId;
      }
    }
  }

  return turns;
}
