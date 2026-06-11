# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
bun install          # install dependencies
bun run src/index.ts # run the CLI
bun test             # run all tests
bun run deploy       # compile and install binary to $HOME/.bin/todos
```

## Architecture

This is a CLI tool for browsing and filtering markdown-based todo files stored in `todos/`. Each `.md` file is a todo: YAML front matter holds structured fields (`status`, `type`, `tags`), and a `# Title` heading plus body form the content.

### Data layer

- `src/todos.ts` — parses a single `.md` file into a `Todo` object
- `src/todoStore.ts` — the active store; reads `todos/` at startup via `useCache`, exposes `all()`, `fields()`, `fieldValues()`, `filterBy()`
- `src/folder.ts` — future optimization stub; builds a filesystem-symlink index under `.todos/<field>/<value>/<id>` for fast filtering; not currently used

### Router (`src/utils/router.ts`)

A composable path-routing system. A `Router<I, O>` is `(i: I) => PromiseOr<Result<O>>` where `Result` is either `Ok<O>` or `RouteNotFound`. Key combinators:

| Export | Behavior |
|--------|----------|
| `select` | Tries each child router in order, returns the first `Ok` |
| `match(token, child)` | Matches a literal path segment, advances to `child` |
| `param(name, child)` | Captures the next path segment as a named param, advances to `child` |
| `route(path, value)` | Constructs a `Route` by splitting `path` on `/` into tokens |
| `ok` / `routeNotFound` | Result constructors |

### Entry point (`src/index.ts`)

Builds a `Router` directly from the todo store using `select`/`match`/`param`, then calls it with `route(process.argv.slice(2).join('/'), '')`. Routes: `all`, `fields`, `values/<field>`, `with/<field>/<value>`.

### Deprecated

- `src/menu.ts` — previous interactive menu system (discriminated-union navigation with `walk`/`stroll`/`strafe`); superseded by the router, kept for reference
- `src/utils/ProviderOr.ts` — lazy-value helper used by the old menu system

### Utilities

- `src/utils/useCache.ts` — simple memoize-once wrapper; the store uses it so todos are read from disk only once per run
- `src/io.ts` — `write` (stdout) and `prompt` (read one line from stdin)
