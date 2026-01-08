# ADDEG — Automatic Dev-Diary Entry Generator

Config-driven, local-first CLI for capturing small notes throughout the day and compiling them into a publish-ready Markdown Dev Diary entry.

## What it does (v0.2)

- **Desktop App:** A native Electron app for distraction-free capture and management.
- **CLI:** Robust command-line interface for scripting and quick add.
- **Inbox:** Captures “events” into an append-only **JSONL inbox** (safe, structured).
- **Compiler:** Compiles events into a **templated Markdown** entry with frontmatter.

## Quickstart (Windows)

For non-developers or quick usage:

1.  Run `run-app.bat` to launch the Desktop App.
2.  Or run `run-dashboard.bat` to launch the Web Dashboard.

Note: Node.js (v18+) is required.

## Install (Dev)

```powershell
# Clone repo
git clone https://github.com/SovereignBuilder/Big-Fat-Developments_ADDEG
cd addeg

# Install dependencies
npm install

# Build
npm run build

# Run the Desktop App (Dev Mode)
npm start
```

## Quickstart (CLI)

1) Initialize config + template:

```powershell
node dist/cli.js init
```

This creates a local `addeg.config.json` (ignored by git) using the default preset.

2) Capture notes during the day:

```powershell
node dist/cli.js add "ctx: Working on UI layout"
node dist/cli.js add "act: Added card component"
node dist/cli.js add "obs: Colors need adjustment"
node dist/cli.js add "open: Research automation tools"
```

3) Compile a draft Dev Diary entry:

```powershell
node dist/cli.js compile --collection devDiary --title "Daily Update" --topics "ui,dev" --open
```

This writes a Markdown file into the configured output folder (default: `./output/`) with `draft: true`.

## Commands

- `addeg init [--preset default] [--force]` — create `addeg.config.json` + template(s).
- `addeg add "<text>" [--date YYYY-MM-DD]` — append a note to the JSONL inbox.
  - Prefixes route into sections: `ctx:`, `act:`, `obs:`, `open:`
- `addeg dashboard` — launch the local web dashboard (browser).

## Configuration

ADDEG looks for `addeg.config.json` in the current directory (or an explicit `--config <path>`).
For public repos, commit `addeg.config.example.json` and keep `addeg.config.json` local (ignored by git).

Key fields:

- `repoRoot` — base folder for resolving relative paths.
- `inboxDir` — where daily JSONL inbox files live.
- `collections.<name>.outputDir` — where compiled Markdown entries are written.
- `collections.<name>.templatePath` — template file.
- `collections.<name>.rules` — optional validation rules (title format, excerpt length, allowed topics).

## Building the App (Windows)

To create a standalone `.exe` installer:

```powershell
npm run dist
```

The installer will be in the `release/` folder.

## What should NOT be committed to git

ADDEG is designed so that the repository can be public without leaking personal notes.

Do **not** commit:

- `inbox/` (contains raw daily notes; may contain sensitive text)
- `addeg.config.json` (usually contains machine-specific absolute paths)
- `*.local.json` / local config variants
- `dist/` (build outputs)
- `release/` (installer outputs)
- `node_modules/`
- OS/editor cruft (`.DS_Store`, `.vscode/`, etc.)

These are already excluded in `.gitignore`.