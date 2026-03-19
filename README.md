# OpenCode Minimal Orchestrator

`opencode-minimal-orchestrator` installs a small orchestration layer for OpenCode without replacing your existing models, providers, or personal config choices.

It exists because OpenCode is already very capable, but repeated multi-step work can still get noisy. This project adds a lightweight orchestration layer that keeps the live session smaller by pushing durable notes into a worktree-local `.journal/` folder while keeping shared, high-signal context in one place.

The goal is not to build a giant swarm framework. The goal is to keep orchestration small, readable, explicit, and only as multi-agent as the task actually needs.

## What You Get

- `/work` for hybrid direct-vs-delegated execution
- `/research` for journaled read-heavy investigation
- `/review` for journaled bounded review
- `orchestrator`, `worker`, `reviewer`, and `explore` agents
- automatic `.journal/` bootstrap in the active project root
- `shared-context.md` plus per-run and per-step journal files

## Fastest Install

If this package is published, install it globally into your OpenCode config with exactly these commands:

```bash
git clone <YOUR_REPO_URL>
cd opencode-minimal-orchestrator
bun run install:global
```

Then start OpenCode as usual.

## Step-By-Step Install

### Option 1: Install into your global OpenCode config

This is the simplest setup if you want the commands available everywhere.

```bash
git clone <YOUR_REPO_URL>
cd opencode-minimal-orchestrator
bun run install:global
```

What this does:

- copies the bundled agents into `~/.config/opencode/agents/`
- copies the bundled commands into `~/.config/opencode/commands/`
- copies the plugin into `~/.config/opencode/plugins/`
- does not require or modify `~/.config/opencode/package.json`
- leaves your existing `~/.config/opencode/opencode.json` choices alone

### Option 2: Install into one project only

Use this if you want the orchestration setup in just one repo.

```bash
git clone <YOUR_REPO_URL>
cd opencode-minimal-orchestrator
bun run install:project -- /path/to/your/project
```

That installs into `/path/to/your/project/.opencode/`.

### Option 3: Install into a specific config directory

If you already manage a custom OpenCode config directory yourself:

```bash
git clone <YOUR_REPO_URL>
cd opencode-minimal-orchestrator
bun run src/cli.ts install --dir "/path/to/opencode-config"
```

## Verify It Worked

After installing, open any repo in OpenCode and check that these commands exist:

- `/work`
- `/research`
- `/review`

When you run one of them, the plugin should create `.journal/` in the active project root, not inside the config folder.

## Managed Files

The installer manages only these files:

- `agents/orchestrator.md`
- `agents/worker.md`
- `agents/reviewer.md`
- `agents/explore.md`
- `commands/work.md`
- `commands/research.md`
- `commands/review.md`
- `plugins/orchestration-journal.ts`

It also writes `.opencode-minimal-orchestrator.json` in the target directory so future installs can update only the files it owns.

If a managed path already exists and is not owned by this installer, installation stops instead of overwriting it. Use `--force` to create a timestamped backup and replace it.

## Development

Validate the package contents:

```bash
bun run validate
```

Run the installer into your own global OpenCode config:

```bash
bun run install:global
```

Run the installer into a local test project:

```bash
bun run src/cli.ts install --project /path/to/project
```
