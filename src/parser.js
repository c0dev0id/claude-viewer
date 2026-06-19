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

function stripAnsi(str) {
  return str.replace(/\x1b\[[0-9;]*[mGKHFABCDJ]/g, '');
}

// Returns { label, detail, _appendResult? } or null for Agent (handled separately).
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
  let afterCommandEvent = false;

  function pushCurrent() {
    if (current) turns.push(current);
    current = null;
  }

  function ensureCurrent() {
    if (!current) {
      current = { id: `turn-${turns.length}`, userText: null, isCommand: false, isCompaction: false, compactionSummary: null, commandResponse: null, segments: [] };
    }
  }

  for (const ev of events) {
    switch (ev?.type) {
      case 'user': {
        const content = ev.message?.content;

        // Always collect tool results for stitching
        for (const tr of extractToolResults(content)) {
          if (tr.tool_use_id) {
            toolResultMap[tr.tool_use_id] =
              typeof tr.content === 'string' ? tr.content : JSON.stringify(tr.content ?? '');
          }
        }

        if (typeof content === 'string') {
          // Caveat-only: skip silently (don't change afterCommandEvent)
          // Caveat-only: skip silently
          if (!content.includes('<command-name>') &&
              !content.includes('<local-command-stdout>') &&
              content.includes('<local-command-caveat>')) {
            break;
          }

          // Compaction summary injected by the CLI
          if (content.includes('previous conversation that ran out of context')) {
            pushCurrent();
            current = { id: `turn-${turns.length}`, isCompaction: true, compactionSummary: content.trim(), userText: null, isCommand: false, commandResponse: null, segments: [] };
            break;
          }

          const cmdMatch = content.match(/<command-name>([\s\S]*?)<\/command-name>/);
          const stdoutMatch = content.match(/<local-command-stdout>([\s\S]*?)<\/local-command-stdout>/);

          if (cmdMatch) {
            const cmdArgsMatch = content.match(/<command-args>([\s\S]*?)<\/command-args>/);
            const cmd = cmdMatch[1].trim();
            const args = cmdArgsMatch ? cmdArgsMatch[1].trim() : '';

            if (cmd === '/compact') {
              // Manual compaction: create a divider turn, discard following stdout
              pushCurrent();
              current = { id: `turn-${turns.length}`, isCompaction: true, compactionSummary: null, userText: null, isCommand: false, commandResponse: null, segments: [] };
            } else {
              // Regular slash command invocation: /effort xhigh, /init, /exit, etc.
              afterCommandEvent = true;
              const prompt = args ? `${cmd} ${args}` : cmd;
              pushCurrent();
              current = { id: `turn-${turns.length}`, userText: prompt, isCommand: true, isCompaction: false, compactionSummary: null, commandResponse: null, segments: [] };
            }
          } else if (stdoutMatch) {
            // Local command response — skip if it belongs to a compaction turn
            afterCommandEvent = false;
            const stdout = stripAnsi(stdoutMatch[1].trim());
            if (stdout) {
              const target = current ?? (turns.length > 0 ? turns[turns.length - 1] : null);
              if (target && !target.isCompaction) target.commandResponse = stdout;
            }
          } else {
            // Regular string user text (strip any embedded caveats)
            afterCommandEvent = false;
            const cleaned = content
              .replace(/<local-command-caveat>[\s\S]*?<\/local-command-caveat>/g, '')
              .trim();
            if (cleaned) {
              pushCurrent();
              current = { id: `turn-${turns.length}`, userText: cleaned, isCommand: false, isCompaction: false, compactionSummary: null, commandResponse: null, segments: [] };
            }
          }
        } else {
          // Array content
          if (afterCommandEvent) {
            // Immediately follows a command event: injected skill instructions — skip
            afterCommandEvent = false;
            break;
          }
          afterCommandEvent = false;
          const userText = extractUserText(content);
          // Skip CLI-injected status messages
          if (userText && /^\[Request interrupted by user.*\]$/.test(userText.trim())) break;
          if (userText) {
            pushCurrent();
            current = { id: `turn-${turns.length}`, userText, isCommand: false, isCompaction: false, compactionSummary: null, commandResponse: null, segments: [] };
          }
        }
        break;
      }

      case 'assistant': {
        afterCommandEvent = false;
        ensureCurrent();
        const agentBlocks = [];

        for (const block of ev.message?.content ?? []) {
          if (block?.type === 'text') {
            const text = block.text ?? '';
            if (!text) continue;
            const last = current.segments[current.segments.length - 1];
            if (last?.type === 'text') {
              last.content += text;
            } else {
              current.segments.push({ type: 'text', content: text });
            }
          } else if (block?.type === 'tool_use') {
            if (block.name === 'Agent') {
              agentBlocks.push(block);
            } else {
              const fmt = formatToolMeta(block);
              if (fmt) {
                current.segments.push({ type: 'meta', meta: { kind: 'tool_use', ...fmt, _toolUseId: block.id } });
              }
            }
          }
          // thinking: skip
        }

        if (agentBlocks.length > 0) {
          current.segments.push({
            type: 'meta',
            meta: {
              kind: 'agents',
              label: agentBlocks.length === 1 ? 'Agent started' : `Agents started (${agentBlocks.length})`,
              detail: null,
              _agentBlocks: agentBlocks.map(b => ({
                id: b.id,
                description: b.input?.description ?? '',
                subagent_type: b.input?.subagent_type ?? '',
              })),
            },
          });
        }
        break;
      }

      case 'attachment': {
        const a = ev.attachment ?? {};
        if (HOOK_TYPES.has(a.type)) {
          ensureCurrent();
          const name = a.hookName ?? a.hookEvent ?? a.type;
          current.segments.push({ type: 'meta', meta: { kind: 'hook', label: `Executing ${name} hook`, detail: null } });
        }
        break;
      }

      default:
        break;
    }
  }
  pushCurrent();

  // Stitch tool results
  for (const turn of turns) {
    for (const seg of turn.segments) {
      if (seg.type !== 'meta') continue;
      const meta = seg.meta;

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
