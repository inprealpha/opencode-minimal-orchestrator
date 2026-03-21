# Shared Project Context

> **This file is auto-injected into every agent's system prompt via `opencode.jsonc`.**
> Keep it concise — every token here is repeated across all agent calls.
> Edit the sections below to give agents the context they need about your project.

---

## Project Overview

*What does this project do? Who is it for? What problem does it solve?*

- Example: A CLI tool that generates invoice PDFs from YAML config files, used by freelancers.

## Architecture

*How is the project structured? Key directories, entry points, data flow.*

- Example: `src/` contains core logic, `src/handlers/` has request handlers, `config/` has environment configs. Requests flow through middleware → router → handler → service → database.

## Tech Stack

*Languages, frameworks, key libraries, runtime versions.*

- Example: TypeScript 5.x, Node 20, Express, Prisma ORM, PostgreSQL 16, Vitest for testing.

## Conventions

*Coding patterns, naming rules, file organization, formatting preferences.*

- Example: Use named exports. Files are kebab-case. Components use PascalCase. Format with Prettier (2-space indent, no semicolons). Prefer `async/await` over `.then()`.

## Domain Knowledge

*Business concepts, domain-specific terms, important relationships agents should know.*

- Example: A "workspace" contains many "projects". Each "project" has "members" with roles (owner, editor, viewer). Billing is per-workspace, not per-project.

## Tone & Communication

*How should agents communicate? Concise or verbose? Formal or casual?*

- Example: Be concise and direct. Skip pleasantries. Use bullet points over paragraphs. Explain trade-offs when suggesting alternatives.
