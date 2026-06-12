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

- `src/todos.ts` — parses a single `.md` file into a `Todo` object; the `Todo` interface includes optional lazy thunks `createdAt?` and `updatedAt?` (both `() => Promise<Date | undefined>`) that are populated by the store
- `src/todoStore.ts` — the active store; reads `todos/` at startup via `useCache`, exposes `all()`, `fields()`, `fieldValues()`, `filterBy()`, `create(slug, type?, tags?)`, `view(config: View)`; attaches `createdAt`/`updatedAt` thunks to each todo loaded from disk
- `src/metaCache.ts` — persistent git-backed metadata cache; reads/writes `.todos/meta.json`; on first access per process it runs one `git ls-files` call to get blob SHAs for all tracked todo files, fetches `git log` dates only for files whose SHA changed since the last run, then writes the updated cache; exposed as `loadMetaCache()` (memoized via `useCache`)
- `src/folder.ts` — future optimization stub; builds a filesystem-symlink index under `.todos/<field>/<value>/<id>` for fast filtering; not currently used

`.todos/meta.json` schema:
```json
{ "<filename>.md": { "blobSha": "<sha>", "createdAt": "<ISO 8601>", "updatedAt": "<ISO 8601>" } }
```
Cache is invalidated per-file by git blob SHA — stable across checkouts and clones, unlike mtime. The `.todos/` directory should be added to `.gitignore`.

### Config layer

- `src/config.ts` — defines the `Config` interface, `applyDisplay(text, fields, config)` (merges style tokens and wraps text in ANSI escape codes), and `applyView(items, view)` (filters by include/exclude conditions and sorts)
- `src/configStore.ts` — reads `todosConfig.json` at startup via `useCache`, returns an empty config if the file is absent; exposes `get(): Promise<Config>`

`todosConfig.json` is optional. Supported format:

```json
{
  "display": {
    "<field>": { "<value>": "<style>" }
  },
  "views": {
    "<name>": {
      "include": [{ "<field>": "<value>" }],
      "exclude": [{ "<field>": "<value>" }],
      "sort": ["<field>", "<field> asc|desc"]
    }
  }
}
```

**display**: Style strings are space-separated tokens. Modifiers: `bold`, `dim`, `italic`, `underline`. Colors: `black`, `red`, `green`, `yellow`, `blue`, `magenta`, `cyan`, `white`, `gray`. When a todo matches rules from multiple fields, all matched tokens are unioned and applied together.

**views**: Each named view defines a reusable filtered+sorted slice of the todo list, invoked with `view <name>`. `include` conditions are ANDed (todo must match all); `exclude` conditions are ORed (todo is dropped if it matches any). `sort` is a multi-key list where each entry is `"<field>"` or `"<field> asc|desc"` (defaults to `asc`).

### Router (`src/utils/router.ts`)

A composable path-routing system. A `Router<I, O>` is `(i: I) => PromiseOr<Result<O>>` where `Result` is either `Ok<O>` or `RouteNotFound`. Key combinators:

| Export | Behavior |
|--------|----------|
| `select` | Tries each child router in order, returns the first `Ok` |
| `match(token, child)` | Matches a literal path segment, advances to `child` |
| `param(name, child)` | Captures the next path segment as a named param, advances to `child` |
| `when(pred, name, child)` | Like `param`, but only captures if the token satisfies `pred` (and is not EOP) |
| `terminal(cb)` | Succeeds only when the next token is EOP; calls `cb` and wraps result in `ok` |
| `route(path, value)` | Constructs a `Route` by splitting `path` on `/` into tokens |
| `ok` / `routeNotFound` | Result constructors |

### Entry point (`src/index.ts`)

Builds a `Router` directly from the todo store using `select`/`match`/`param`/`when`/`terminal`, then calls it with `route(process.argv.slice(2).join('/'), '')`. Routes:

| Command | Description |
|---------|-------------|
| `all` | List all todos as an aligned table with datetimes |
| `fields` | List available fields |
| `values/<field>` | List values for a field |
| `with/<field>/<value>` | Filter todos by field value, table format |
| `view/<name>` | Apply a named view from config, table format |
| `create <slug>` | Create a todo (type defaults to `task`) |
| `create <type> <slug>` | Create a todo with a given type |
| `create <slug> #<tags>` | Create a todo with comma-separated tags |
| `create <type> <slug> #<tags>` | Create a todo with type and tags |
| `<id> set <field> <value>` | Set a field on a todo |

Tags tokens are distinguished from type/slug tokens by a leading `#`.

Listing commands (`all`, `with`, `view`) render via `tableDisplay(todos)`, which resolves all date thunks in parallel, then formats output as a fixed-width table with columns: `#id`, `title`, `created → updated` (datetimes in local time, `YYYY-MM-DD HH:MM`). `create` and `set` use `shortDisplay` (compact, no dates).

### Deprecated

- `src/menu.ts` — previous interactive menu system (discriminated-union navigation with `walk`/`stroll`/`strafe`); superseded by the router, kept for reference
- `src/utils/ProviderOr.ts` — lazy-value helper used by the old menu system

### Utilities

- `src/utils/useCache.ts` — simple memoize-once wrapper; used by the store (todos read once per run) and `metaCache.ts` (meta cache built once per run)
- `src/io.ts` — `write` (stdout) and `prompt` (read one line from stdin)
