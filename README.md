# cc-file-churn

Which files does Claude Code touch the most? Find the hotspots.

```
npx cc-file-churn
```

## What it does

Scans all your `~/.claude/projects/` session transcripts and counts every `Edit`, `Write`, `Read`, `Grep`, and `Glob` tool call per file. Shows a ranked list with color-coded progress bars.

## Example output

```
cc-file-churn — Most-touched files in your Claude Code sessions

Scanned 755 session files · 2,219 unique files · 12,476 tool calls

① ████████████████████ 933 total
   ~/.claude/plans/staged-hatching-backus.md
   669 writes  239 reads  25 searches

② ██████████████░░░░░░ 671 total
   ~/projects/dungeon-diablo/dungeon_game.py
   70 writes  313 reads  288 searches

③ ███████████░░░░░░░░░ 493 total
   ~/schedule-app/index.html
   215 writes  218 reads  60 searches
```

## Why this is interesting

The #1 most-touched file in my 60 days: a planning file with 669 writes. #2: the game I spent 3 months building. #3: a schedule app I built in one session.

Your highest-churn files reveal:
- **Where the AI spends most effort** (vs where you think it does)
- **Which files are becoming complexity magnets**
- **Which projects actually got attention** (vs the ones that felt important)

## Options

```bash
npx cc-file-churn              # Top 20 files by total activity
npx cc-file-churn 10           # Top 10
npx cc-file-churn --writes     # Rank by write frequency (most-modified)
npx cc-file-churn --reads      # Rank by read frequency (most-referenced)
npx cc-file-churn --days=7     # Only last 7 days
npx cc-file-churn --project=my-app  # Filter to a specific project
npx cc-file-churn --json       # JSON output for scripting
```

## Part of cc-toolkit

One of 50 free tools for Claude Code users → [cc-toolkit](https://yurukusa.github.io/cc-toolkit/)

## License

MIT

### Want to optimize how Claude Code uses its tools?

**[Claude Code Ops Kit](https://yurukusa.github.io/cc-ops-kit-landing/?utm_source=github&utm_medium=readme&utm_campaign=cc-file-churn)** ($19) — 16 production hooks + 5 templates + 3 tools. Built from 160+ hours of autonomous operation.
