function trunc(str, max) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max - 1) + '\u2026' : str;
}

function basename(fp) {
  return (fp ?? '').split('/').pop() || fp;
}

function readRange(input) {
  if (input.offset == null) return '';
  const start = input.offset;
  const end = input.limit != null ? start + input.limit : '\u2026';
  return ` ${start}:${end}`;
}

// Returns { label, detail, _appendResult? } or null for Agent (handled separately).
// detail=null means non-expandable; result will fill it during stitching if _appendResult is falsy.
function formatToolMeta(block) {
  const name = block.name ?? 'tool';
  const inp = block.input ?? {};

  switch (name) {
    case 'Bash':
      return {
        label: `bash: ${trunc(inp.command ?? '', 100)}`,
        detail: `$ ${inp.command ?? ''}`,
        _appendResult: true,
      };

    case 'Read':
      return {
        label: `read: ${basename(inp.file_path)}${readRange(inp)}`,
        detail: null,
      };

    case 'Write':
      return {
        label: `write: ${basename(inp.file_path ?? '')}`,
        detail: inp.content ?? '',
      };

    case 'Edit':
      return {
        label: `edit: ${basename(inp.file_path ?? '')}`,
        detail: `--- old\n${inp.old_string ?? ''}\n+++ new\n${inp.new_string ?? ''}`,
      };

    case 'Glob':
      return { label: `glob: ${trunc(inp.pattern ?? '', 80)}`, detail: null };

    case 'Grep':
      return { label: `grep: ${trunc(inp.pattern ?? '', 80)}`, detail: null };

    case 'Skill':
      return { label: `Executing ${inp.skill ?? name} skill`, detail: null };

    case 'WebFetch':
      return { label: `fetch: ${trunc(inp.url ?? '', 80)}`, detail: null };

    case 'WebSearch':
      return { label: `search: ${trunc(inp.query ?? '', 80)}`, detail: null };

    case 'Agent':
      return null;

    default: {
      const firstVal = Object.values(inp)[0];
      const hint = firstVal != null ? ` ${trunc(String(firstVal), 60)}` : '';
      return { label: `${name.toLowerCase()}:${hint}`, detail: null };
    }
  }
}

function extractUserText(content) {
  if (typeof content === 'string') return content.trim() || null;
  if (!Array.isArray(content)) return null;
  return content
    .filter(b => b?.type === 'text')
    .map(b => b.text ?? '')
    .join('\n')
    .trim() || null;
}

function extractToolResults(content) {
  if (!Array.isArray(content)) return [];
  return content.filter(b => b?.type === 'tool_result');
}

const HOOK_TYPES = new Set([
  'hook_success', 'hook_additional_context', 'hook_failure', 'stop_hook_result',
]);

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

        for (const tr of extractToolResults(content)) {
          if (tr.tool_use_id) {
            toolResultMap[tr.tool_use_id] =
              typeof tr.content === 'string' ? tr.content : JSON.stringify(tr.content ?? '');
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
        const agentBlocks = [];

        for (const block of ev.message?.content ?? []) {
          if (block?.type === 'text') {
            current.assistantText = (current.assistantText ?? '') + block.text;
          } else if (block?.type === 'tool_use') {
            if (block.name === 'Agent') {
              agentBlocks.push(block);
            } else {
              const fmt = formatToolMeta(block);
              if (fmt) {
                current.metaItems.push({ kind: 'tool_use', ...fmt, _toolUseId: block.id });
              }
            }
          }
          // thinking: skip
        }

        if (agentBlocks.length > 0) {
          current.metaItems.push({
            kind: 'agents',
            label: agentBlocks.length === 1 ? 'Agent started' : `Agents started (${agentBlocks.length})`,
            detail: null,
            _agentBlocks: agentBlocks.map(b => ({
              id: b.id,
              description: b.input?.description ?? '',
              subagent_type: b.input?.subagent_type ?? '',
            })),
          });
        }
        break;
      }

      case 'attachment': {
        const a = ev.attachment ?? {};
        if (HOOK_TYPES.has(a.type)) {
          ensureCurrent();
          const name = a.hookName ?? a.hookEvent ?? a.type;
          current.metaItems.push({ kind: 'hook', label: `Executing ${name} hook`, detail: null });
        }
        // All other attachment types (file snapshots, deferred tools, etc.): skip
        break;
      }

      // system, permission-mode, and all other top-level event types: skip
      default:
        break;
    }
  }
  pushCurrent();

  // Stitch tool results
  for (const turn of turns) {
    for (const meta of turn.metaItems) {
      if (meta.kind === 'tool_use' && meta._toolUseId) {
        const result = toolResultMap[meta._toolUseId] ?? '';
        if (meta._appendResult) {
          if (result) meta.detail += '\n\n' + result;
          delete meta._appendResult;
        } else if (meta.detail === null) {
          meta.detail = result || null;
        }
        delete meta._toolUseId;
      }

      if (meta.kind === 'agents' && meta._agentBlocks) {
        const lines = meta._agentBlocks.map(agent => {
          const result = toolResultMap[agent.id] ?? '';
          const type = agent.subagent_type || 'Agent';
          const desc = trunc(agent.description, 80);
          const chars = result.length;
          const size = chars >= 1000 ? `${Math.round(chars / 1000)}k chars` : `${chars} chars`;
          return `${type}: ${desc}\n${size}`;
        }).join('\n\n');
        meta.detail = lines || null;
        delete meta._agentBlocks;
      }
    }
  }

  return turns;
}
