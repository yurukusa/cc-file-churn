#!/usr/bin/env node

// cc-file-churn — Which files does Claude Code touch the most?
// Scans ~/.claude/projects/ session transcripts, tallies Edit/Write/Read/Grep tool calls per file.
// Zero dependencies. Works across all Claude Code projects.

import { readdir, stat, open } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { homedir } from 'node:os';

// ── Config ──────────────────────────────────────────────────────

const READ_TOOLS = new Set(['Read']);
const WRITE_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit']);
const SEARCH_TOOLS = new Set(['Grep', 'Glob']);
const ALL_TRACKED = new Set([...READ_TOOLS, ...WRITE_TOOLS, ...SEARCH_TOOLS]);

const TAIL_BYTES = 4_194_304; // 4MB per file (faster than full scan)

// ── Colors ──────────────────────────────────────────────────────

const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  blue: '\x1b[34m', cyan: '\x1b[36m', white: '\x1b[37m',
  orange: '\x1b[38;5;208m',
};

function bar(n, max, width = 20) {
  const filled = max > 0 ? Math.round((n / max) * width) : 0;
  return C.cyan + '█'.repeat(filled) + C.dim + '░'.repeat(width - filled) + C.reset;
}

// ── File reading ─────────────────────────────────────────────────

async function readChunk(filePath, maxBytes) {
  const fh = await open(filePath, 'r');
  try {
    const { size } = await fh.stat();
    const start = Math.max(0, size - maxBytes);
    const buf = Buffer.alloc(size - start);
    const { bytesRead } = await fh.read(buf, 0, buf.length, start);
    return buf.toString('utf8', 0, bytesRead);
  } finally {
    await fh.close();
  }
}

// ── Parse tool calls from jsonl chunk ───────────────────────────

function parseChunk(chunk, fileMap, toolMap) {
  const lines = chunk.split('\n');
  for (const line of lines) {
    if (!line.trim()) continue;
    let d;
    try { d = JSON.parse(line); } catch { continue; }
    if (d.type !== 'assistant') continue;
    for (const content of d?.message?.content ?? []) {
      if (content?.type !== 'tool_use') continue;
      const toolName = content.name;
      if (!ALL_TRACKED.has(toolName)) continue;
      const inp = content.input ?? {};
      const path = inp.file_path ?? inp.path ?? '';
      if (!path || typeof path !== 'string') continue;
      // Normalize: remove absolute prefix up to home
      const norm = path.replace(/^\/home\/[^/]+/, '~');
      if (!fileMap.has(norm)) fileMap.set(norm, { r: 0, w: 0, s: 0 });
      const e = fileMap.get(norm);
      if (READ_TOOLS.has(toolName)) e.r++;
      else if (WRITE_TOOLS.has(toolName)) e.w++;
      else if (SEARCH_TOOLS.has(toolName)) e.s++;
      toolMap.set(toolName, (toolMap.get(toolName) ?? 0) + 1);
    }
  }
}

// ── Find all jsonl files ─────────────────────────────────────────

async function findJsonlFiles(projectFilter) {
  const base = join(homedir(), '.claude', 'projects');
  let dirs;
  try { dirs = await readdir(base); } catch { return []; }
  const files = [];
  for (const dir of dirs) {
    if (projectFilter && !dir.includes(projectFilter)) continue;
    const dirPath = join(base, dir);
    let entries;
    try { entries = await readdir(dirPath); } catch { continue; }
    for (const e of entries) {
      if (!e.endsWith('.jsonl')) continue;
      const fp = join(dirPath, e);
      try {
        const s = await stat(fp);
        files.push({ fp, size: s.size, mtime: s.mtimeMs, project: dir });
      } catch {}
    }
  }
  return files;
}

// ── Main ─────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const topN = parseInt(args.find(a => a.match(/^\d+$/)) ?? '20');
  const showWrites = args.includes('--writes') || args.includes('-w');
  const showReads = args.includes('--reads') || args.includes('-r');
  const showAll = args.includes('--all') || args.includes('-a');
  const jsonOut = args.includes('--json');
  const projectFilter = args.find(a => a.startsWith('--project='))?.split('=')[1];
  const daysArg = args.find(a => a.startsWith('--days='))?.split('=')[1];
  const sinceMs = daysArg ? Date.now() - parseInt(daysArg) * 86400_000 : 0;

  const files = await findJsonlFiles(projectFilter);
  if (!files.length) {
    console.error('No Claude Code session files found.');
    process.exit(1);
  }

  const filtered = sinceMs ? files.filter(f => f.mtime >= sinceMs) : files;

  const fileMap = new Map();
  const toolMap = new Map();
  let processed = 0;

  for (const f of filtered) {
    try {
      const chunk = await readChunk(f.fp, TAIL_BYTES);
      parseChunk(chunk, fileMap, toolMap);
      processed++;
    } catch {}
  }

  // Build sorted list
  const entries = [...fileMap.entries()].map(([path, c]) => ({
    path, reads: c.r, writes: c.w, searches: c.s, total: c.r + c.w + c.s,
  }));

  // Filter mode
  let display = showWrites ? entries.filter(e => e.writes > 0) :
                showReads ? entries.filter(e => e.reads > 0) :
                entries;
  display.sort((a, b) => (showWrites ? b.writes - a.writes :
                           showReads ? b.reads - a.reads :
                           b.total - a.total));
  display = display.slice(0, showAll ? 50 : topN);

  if (jsonOut) {
    console.log(JSON.stringify({ files_analyzed: processed, top: display }, null, 2));
    return;
  }

  const maxVal = display[0]?.total ?? 1;
  const totalOps = [...fileMap.values()].reduce((s, c) => s + c.r + c.w + c.s, 0);

  console.log(`\n${C.bold}cc-file-churn${C.reset} — Most-touched files in your Claude Code sessions\n`);
  console.log(`${C.dim}Scanned ${processed} session files · ${fileMap.size} unique files · ${totalOps} tool calls${daysArg ? ` (last ${daysArg}d)` : ''}${C.reset}\n`);

  const rank = [C.yellow + '①', C.white + '②', C.dim + '③'];
  display.forEach((e, i) => {
    const medal = rank[i] ?? C.dim + `${String(i + 1).padStart(2)}`;
    const shortPath = e.path.length > 60 ? '…' + e.path.slice(-59) : e.path;
    const barVal = showWrites ? e.writes : showReads ? e.reads : e.total;
    console.log(`${medal}${C.reset} ${bar(barVal, maxVal)} ${C.bold}${barVal}${C.reset} ${C.dim}total${C.reset}`);
    console.log(`   ${C.cyan}${shortPath}${C.reset}`);
    if (e.writes > 0 || e.reads > 0 || e.searches > 0) {
      const parts = [];
      if (e.writes > 0) parts.push(`${C.orange}${e.writes} writes${C.reset}`);
      if (e.reads > 0) parts.push(`${C.green}${e.reads} reads${C.reset}`);
      if (e.searches > 0) parts.push(`${C.dim}${e.searches} searches${C.reset}`);
      console.log(`   ${parts.join('  ')}`);
    }
    console.log();
  });

  // Tool breakdown
  const topTools = [...toolMap.entries()].sort((a, b) => b[1] - a[1]);
  console.log(`${C.dim}Tool breakdown: ${topTools.map(([t, n]) => `${t}:${n}`).join(' · ')}${C.reset}\n`);
  console.log(`${C.dim}Options: --writes (-w) write-heavy files · --reads (-r) read-heavy files · --days=7 last N days · --project=name filter project · --json JSON output${C.reset}\n`);
}

main().catch(e => { console.error(e.message); process.exit(1); });
