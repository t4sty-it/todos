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

- `src/todos.ts` — parses a single `.md` file into a `Todo` object; the `Todo` interface includes optional lazy thunks `createdAt?` and `updatedAt?` (both `() => Promise<Date | undefined>`) that are populated by the store; exports `parseTitle`
- `src/todoStore.ts` — the active store; exposes `all()`, `get(id)`, `tag(id, op, tag)`, `fields()`, `fieldValues()`, `filterBy()`, `create(slug, type?, tags?)`, `view(config: View)`, `reload()`; `set()` rejects writes to read-only fields (`id`, `url`, `createdAt`, `updatedAt`). **Listing operations** (`all`, `fields`, `fieldValues`, `filterBy`, `view`) are served from the meta cache without reading any todo files. `get(id)` reads one file for `description` and re-attaches date thunks from the listing. Write operations (`tag`, `set`) mutate the in-memory meta cache Map in-place so the listing stays consistent across the internal todos-cache reset. `reload()` resets both the todos cache and the meta cache.
- `src/metaCache.ts` — persistent git-backed metadata cache; reads/writes `.todos/meta.json`; on first access per process it runs one `git ls-files` call to get blob SHAs for all tracked todo files, reads file content and fetches `git log` dates for stale files, then writes the updated cache; exposed as `loadMetaCache()` (memoized, resettable via `resetMetaCache()`); entries with missing or invalid dates are silently omitted from the returned Map

`.todos/meta.json` schema:
```json
{
  "<filename>.md": {
    "blobSha": "<sha>",
    "schemaVersion": 1,
    "createdAt": "<ISO 8601>",
    "updatedAt": "<ISO 8601>",
    "slug": "<id>",
    "title": "<title>",
    "status": "<status>",
    "type": "<type>",
    "tags": ["<tag>"]
  }
}
```
Cache is invalidated per-file by git blob SHA — stable across checkouts and clones, unlike mtime. `schemaVersion` guards against stale entries that predate new fields (increment it when adding fields). Untracked files (not yet committed) are not in the cache; the store falls back to reading those from disk. The `.todos/` directory should be added to `.gitignore`.

### Config layer

- `src/config.ts` — defines the `Config` interface, `applyDisplay(text, fields, config)` (merges style tokens and wraps text in ANSI escape codes), and `applyView(items, view)` (filters by include/exclude conditions and sorts)
- `src/configStore.ts` — reads `todosConfig.json` at startup via `useCache`, returns an empty config if the file is absent; prints a warning to stderr if the file exists but cannot be parsed; exposes `get(): Promise<Config>`

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

**editor**: Command used to open todo files (e.g. `"nvim"`, `"code --wait"`). Falls back to `$EDITOR` if absent. Multi-word commands are split on whitespace before spawning.

**display**: Style strings are space-separated tokens. Modifiers: `bold`, `dim`, `italic`, `underline`. Colors: `black`, `red`, `green`, `yellow`, `blue`, `magenta`, `cyan`, `white`, `gray`. When a todo matches rules from multiple fields, all matched tokens are unioned and applied together.

**views**: Each named view defines a reusable filtered+sorted slice of the todo list, invoked with `view <name>`. `include` conditions are ANDed (todo must match all); `exclude` conditions are ORed (todo is dropped if it matches any). `sort` is a multi-key list where each entry is `"<field>"` or `"<field> asc|desc"` (defaults to `asc`).

### Router (`src/utils/router.ts`)

A composable path-routing system. A `Router<I, O>` is `(i: I) => PromiseOr<Result<O>>` where `Result` is either `Ok<O>` or `RouteNotFound`. Key combinators:

| Export | Behavior |
|--------|----------|
| `select` | Tries each child router in order, returns the first `Ok`; implements `Doc` by aggregating child docs |
| `match(token, child)` | Matches a literal path segment, advances to `child` |
| `param(name, child)` | Captures the next path segment as a named param, advances to `child`; implements `Doc` by delegating to child |
| `when(pred, name, child)` | Like `param`, but only captures if the token satisfies `pred` (and is not EOP) |
| `terminal(cb)` | Succeeds only when the next token is EOP; calls `cb` and wraps result in `ok` |
| `route(path, value)` | Constructs a `Route` by splitting `path` on `/` into tokens |
| `ok` / `routeNotFound` | Result constructors |
| `doc(command, description, router)` | Wraps a router with a `Doc` annotation; `command` and `description` are used by `helpText` |
| `helpText(router)` | Extracts all `Doc` annotations from a router tree and formats them as an aligned command listing |

### Entry point (`src/index.ts`)

Builds a `Router` directly from the todo store using `select`/`match`/`param`/`when`/`terminal`/`doc`, then calls it with `route(process.argv.slice(2).join('/'), '')`. Passing no arguments, `--help`, or `-h` (or an unrecognised route) prints help via `helpText(router)`. Routes:

| Command | Description |
|---------|-------------|
| `--help` / `-h` | Print help listing all commands (also shown when no args given or route not found) |
| `all` | List all todos as an aligned table with datetimes |
| `fields` | List available fields |
| `values/<field>` | List values for a field |
| `with/<field>/<value>` | Filter todos by field value, table format; empty string matches absent/empty fields |
| `view/<name>` | Apply a named view from config, table format |
| `create <slug>` | Create a todo (type defaults to `task`) |
| `create <type> <slug>` | Create a todo with a given type |
| `create <slug> #<tags>` | Create a todo with comma-separated tags |
| `create <type> <slug> #<tags>` | Create a todo with type and tags |
| `<id>` | Show full detail for a single todo (all fields, description, dates) |
| `<id> edit` | Open the todo file in the configured editor; shows updated detail on exit |
| `<id> tag add <tag>` | Add a tag to a todo (idempotent) |
| `<id> tag remove <tag>` | Remove a tag from a todo |
| `<id> set <field> <value>` | Set a field on a todo (`id`, `url`, `createdAt`, `updatedAt` are read-only) |

Tags tokens are distinguished from type/slug tokens by a leading `#`.

Listing commands (`all`, `with`, `view`) render via `tableDisplay(todos)`, which resolves all date thunks in parallel, then formats output as a fixed-width table with columns: `#id`, `title`, `created → updated` (datetimes in local time, `YYYY-MM-DD HH:MM`). `create` and `set` use `shortDisplay` (compact, no dates).

### Utilities

- `src/utils/useCache.ts` — simple memoize-once wrapper; used by the store (todos read once per run) and `metaCache.ts` (meta cache built once per run)
- `src/io.ts` — `write` (stdout) and `prompt` (read one line from stdin)
