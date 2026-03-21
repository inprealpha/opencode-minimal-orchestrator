# Shared Project Context Template

> **Starter scaffold:** replace the placeholder text below with project-specific facts.
> This file is meant for the orchestrator to load explicitly, then hand off the relevant parts each sub-agent needs.
> Keep it concise, delete sections that do not matter, and remove the example bullets once you have real content.

---

## Project Overview

*Scaffold — replace with what the project does, who it is for, and what problem it solves.*

- Example: A CLI tool that generates invoice PDFs from YAML config files, used by freelancers.

## Architecture

*Scaffold — replace with key directories, entry points, and the main data or request flow.*

- Example: `src/` contains core logic, `src/handlers/` has request handlers, `config/` has environment configs. Requests flow through middleware → router → handler → service → database.

## Tech Stack

*Scaffold — replace with languages, frameworks, key libraries, and runtime versions.*

- Example: TypeScript 5.x, Node 20, Express, Prisma ORM, PostgreSQL 16, Vitest for testing.

## Conventions

*Scaffold — replace with coding patterns, naming rules, file organization, and formatting preferences.*

- Example: Use named exports. Files are kebab-case. Components use PascalCase. Format with Prettier (2-space indent, no semicolons). Prefer `async/await` over `.then()`.

## Domain Knowledge

*Scaffold — replace with business concepts, domain terms, and important relationships agents should know.*

- Example: A "workspace" contains many "projects". Each "project" has "members" with roles (owner, editor, viewer). Billing is per-workspace, not per-project.

## Tone & Communication

*Scaffold — replace with how agents should communicate in this project.*

- Example: Be concise and direct. Skip pleasantries. Use bullet points over paragraphs. Explain trade-offs when suggesting alternatives.
