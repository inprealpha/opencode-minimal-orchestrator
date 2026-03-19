#!/usr/bin/env bun

import * as fs from "node:fs/promises"
import * as path from "node:path"
import * as os from "node:os"

const root = path.resolve(import.meta.dir, "..")
const assets = path.join(root, "assets")
const mark = ".opencode-minimal-orchestrator.json"

function help() {
  console.log([
    "OpenCode Minimal Orchestrator installer",
    "",
    "Usage:",
    "  bun run src/cli.ts install --global",
    "  bun run src/cli.ts install --project .",
    "  bun run src/cli.ts install --dir /path/to/opencode-config",
    "  bun run src/cli.ts validate",
    "",
    "Flags:",
    "  --global        Install into the global OpenCode config directory",
    "  --project PATH  Install into PATH/.opencode",
    "  --dir PATH      Install into an explicit target directory",
    "  --force         Overwrite collisions after backing them up",
  ].join("\n"))
}

function global_dir() {
  if (process.platform === "win32") {
    return path.join(process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming"), "opencode")
  }

  return path.join(process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), ".config"), "opencode")
}

function stamp() {
  return new Date().toISOString().replace(/[:]/g, "-")
}

async function walk(dir: string, base = dir): Promise<string[]> {
  const items = await fs.readdir(dir, { withFileTypes: true })
  const files = await Promise.all(
    items
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(async (item) => {
        const next = path.join(dir, item.name)
        if (item.isDirectory()) return walk(next, base)
        return [path.relative(base, next).split(path.sep).join("/")]
      }),
  )

  return files.flat()
}

async function text(file: string) {
  return fs.readFile(file, "utf8").catch(() => undefined)
}

async function json(file: string) {
  const body = await text(file)
  if (!body) return undefined

  return JSON.parse(body) as {
    files?: string[]
  }
}

function parse(argv: string[]) {
  const rest = [...argv]
  const cmd = rest[0] && !rest[0].startsWith("-") ? rest.shift()! : "install"
  const opts = {
    cmd,
    force: false,
    global: false,
    project: undefined as string | undefined,
    dir: undefined as string | undefined,
  }

  while (rest.length) {
    const arg = rest.shift()!
    if (arg === "--force") {
      opts.force = true
      continue
    }
    if (arg === "--global") {
      opts.global = true
      continue
    }
    if (arg === "--project") {
      opts.project = rest.shift() ?? "."
      continue
    }
    if (arg === "--dir") {
      opts.dir = rest.shift()
      continue
    }
    if (arg === "--help" || arg === "-h") {
      opts.cmd = "help"
      continue
    }
    throw new Error(`Unknown argument: ${arg}`)
  }

  return opts
}

function target(opts: ReturnType<typeof parse>) {
  if (opts.dir) return path.resolve(opts.dir)
  if (opts.project) return path.join(path.resolve(opts.project), ".opencode")
  if (opts.global || (!opts.dir && !opts.project)) return global_dir()
  return global_dir()
}

async function validate() {
  const files = await walk(assets)
  const needed = [
    "agents/orchestrator.md",
    "agents/worker.md",
    "agents/reviewer.md",
    "agents/explore.md",
    "commands/work.md",
    "commands/research.md",
    "commands/review.md",
    "plugins/orchestration-journal.ts",
  ]

  const miss = needed.filter((file) => !files.includes(file))
  if (miss.length) {
    throw new Error(`Missing asset files:\n${miss.map((file) => `- ${file}`).join("\n")}`)
  }

  console.log(`Validated ${files.length} asset files in ${assets}`)
}

async function install(opts: ReturnType<typeof parse>) {
  const dir = target(opts)
  const file = path.join(dir, mark)
  const prev = await json(file)
  const own = new Set(prev?.files ?? [])
  const files = await walk(assets)
  const clashes = [] as string[]

  for (const rel of files) {
    const dst = path.join(dir, rel)
    const next = await text(path.join(assets, rel))
    const cur = await text(dst)

    if (cur === undefined || cur === next || own.has(rel) || opts.force) continue
    clashes.push(rel)
  }

  if (clashes.length) {
    throw new Error([
      `Refusing to overwrite existing files in ${dir}`,
      ...clashes.map((rel) => `- ${rel}`),
      "Re-run with --force to back them up and overwrite them.",
    ].join("\n"))
  }

  await fs.mkdir(dir, { recursive: true })

  for (const rel of files) {
    const src = path.join(assets, rel)
    const dst = path.join(dir, rel)
    const next = await text(src)
    const cur = await text(dst)

    if (cur === next) continue

    await fs.mkdir(path.dirname(dst), { recursive: true })
    if (cur !== undefined && !own.has(rel) && opts.force) {
      await fs.copyFile(dst, `${dst}.bak-${stamp()}`)
    }
    await fs.copyFile(src, dst)
  }

  await fs.writeFile(
    file,
    JSON.stringify(
      {
        name: "opencode-minimal-orchestrator",
        version: "0.1.0",
        installed_at: new Date().toISOString(),
        files,
      },
      null,
      2,
    ) + "\n",
  )

  console.log([
    `Installed minimal orchestrator into ${dir}`,
    ...files.map((rel) => `- ${rel}`),
    `- ${mark}`,
  ].join("\n"))
}

const opts = parse(process.argv.slice(2))

if (opts.cmd === "help") {
  help()
  process.exit(0)
}

if (opts.cmd === "validate") {
  await validate()
  process.exit(0)
}

if (opts.cmd !== "install") {
  throw new Error(`Unknown command: ${opts.cmd}`)
}

await install(opts)
