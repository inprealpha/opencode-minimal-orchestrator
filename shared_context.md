# Shared Project Context — Optional Reference Template

> **This file is optional.** The orchestrator bootstraps from standard project files (`README`, `package.json`, `pyproject.toml`, etc.) by default.
> Create this file only when you have curated project knowledge worth preserving across sessions — things the orchestrator cannot reliably infer from source files alone.
> Delete any section you do not need. Remove example bullets once you add real content.

---

## Project Overview

*What the project does, who it is for, and what problem it solves.*

- Example: A CLI tool that generates invoice PDFs from YAML config files, used by freelancers.

## Architecture

*Key directories, entry points, and the main data or request flow.*

- Example: `src/` contains core logic, `src/handlers/` has request handlers, `config/` has environment configs. Requests flow through middleware → router → handler → service → database.

## Tech Stack

*Languages, frameworks, key libraries, and runtime versions.*

- Example: TypeScript 5.x, Node 20, Express, Prisma ORM, PostgreSQL 16, Vitest for testing.

## Conventions

*Coding patterns, naming rules, file organization, and formatting preferences.*

- Example: Use named exports. Files are kebab-case. Components use PascalCase. Format with Prettier (2-space indent, no semicolons). Prefer `async/await` over `.then()`.

## Key Terms (optional)

*Domain-specific terms, abbreviations, or concept relationships that are not obvious from the code.*

- Example: A "workspace" contains many "projects". Each "project" has "members" with roles (owner, editor, viewer). Billing is per-workspace, not per-project.

## Tone & Communication (optional)

*How agents should communicate in this project. If omitted, agents default to: clear, precise, technically honest — aimed at a technical audience that may not be developers.*

- Default: Explain what was done and why, without jargon shortcuts or oversimplification. [Example: say "the request failed because the server returned a 403 status, meaning the credentials lack permission for that endpoint" — not "got a 403" and not "the computer said no."]
- Override example: Be terse. Skip context. Bullet points only. Assume the reader is a senior engineer on the team.
