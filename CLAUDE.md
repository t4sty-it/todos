# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
bun install                    # install dependencies
bun run src/index.ts           # run the CLI
bun test                       # run all tests
bun run deploy                 # compile and install binary to $HOME/.bin/todos and completion script to $HOME/.bash_completion.d/todos
bun run release <version>      # cross-compile for all platforms, bump package.json, and publish a GitHub Release (e.g. bun run release 0.28.0)
```

## Architecture

This is a CLI tool for browsing and filtering markdown-based todo files stored in `todos/`. Each `.md` file is a todo: YAML front matter holds structured fields (`status`, `type`, `tags`) plus arbitrary fields (any YAML key whose value is a `string` or `string[]`), and a `# Title` heading plus body form the content.

### Data layer

- `src/todos.ts` — parses a single `.md` file into a `Todo` object; the `Todo` interface includes optional lazy thunks `createdAt?` and `updatedAt?` (both `() => Promise<Date | undefined>`) that are populated by the store; arbitrary front matter fields land in `extraFields?: Record<string, string | string[]>`; exports `parseTitle`
- `src/todoStore.ts` — the active store; exposes `all()`, `get(id)`, `tag(id, op, tag)`, `fields()`, `fieldValues()`, `filterBy()`, `search(query)`, `create(slug, type?, tags?)`, `view(config: View)`, `reload()`; `set()` rejects writes to read-only fields (`id`, `url`, `createdAt`, `updatedAt`). **Listing operations** (`all`, `fields`, `fieldValues`, `filterBy`, `view`) are served from the meta cache without reading any todo files. `get(id)` reads one file for `description` and re-attaches date thunks from the listing. `search(query)` reads all files to include description in matching (see below). Write operations (`tag`, `set`) mutate the in-memory meta cache Map in-place so the listing stays consistent across the internal todos-cache reset. `reload()` resets both the todos cache and the meta cache. `fields()` returns `string[]` (not `keyof Todo`) and includes keys from `extraFields`. `fieldValues()`, `filterBy()`, and `set()` all accept `string` field names and route to `extraFields` for non-built-in keys.
- `src/metaCache.ts` — persistent git-backed metadata cache; reads/writes `.todos/meta.json`; on first access per process it runs one `git ls-files` call to get blob SHAs for all tracked todo files, reads file content and fetches `git log` dates for stale files, then writes the updated cache; exposed as `loadMetaCache()` (memoized, resettable via `resetMetaCache()`); entries with missing or invalid dates are silently omitted from the returned Map

`.todos/meta.json` schema:
```json
{
  "<filename>.md": {
    "blobSha": "<sha>",
    "schemaVersion": 4,
    "createdAt": "<ISO 8601>",
    "updatedAt": "<ISO 8601>",
    "id": "<id>",
    "title": "<title>",
    "status": "<status>",
    "type": "<type>",
    "tags": ["<tag>"],
    "extraFields": { "<key>": "<string or string[]>" }
  }
}
```
Cache is invalidated per-file by git blob SHA — stable across checkouts and clones, unlike mtime. `schemaVersion` guards against stale entries that predate new fields (current value: `4`; increment it when adding fields to the cache schema). Untracked files (not yet committed) are not in the cache; the store falls back to reading those from disk. The `.todos/` directory should be added to `.gitignore`.

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

**paths**: Array of directory paths to search for todo files. Defaults to `["todos"]` if absent or empty. Paths may be relative to the project root or absolute. Absolute paths support todos tracked in different git repositories — git log/ls-files commands run against the correct repo for each path. New todos are created in the first configured path. `todo.url` always includes the source-path prefix (e.g. `todos/1-slug.md`, `work-todos/2-slug.md`). The meta cache key scheme changed from filename-relative-to-todos to full-path (`todos/1-slug.md`) in schema version 3.

**display**: Style strings are space-separated tokens. Modifiers: `bold`, `dim`, `italic`, `underline`. Colors: `black`, `red`, `green`, `yellow`, `blue`, `magenta`, `cyan`, `white`, `gray`. When a todo matches rules from multiple fields, all matched tokens are unioned and applied together.

**views**: Each named view defines a reusable filtered+sorted slice of the todo list, invoked with `view <name>`. `include` conditions are ANDed (todo must match all); `exclude` conditions are ORed (todo is dropped if it matches any). `sort` is a multi-key list where each entry is `"<field>"` or `"<field> asc|desc"` (defaults to `asc`).

**JSON Schema**: `todosConfig.schema.json` at the repo root describes all supported fields. `.vscode/settings.json` maps it to `todosConfig.json` so VS Code shows hints without requiring a `$schema` field in the config. The schema's `$id` is set to `https://json.schemastore.org/todos-config.json` for future SchemaStore submission.

### Router (`src/utils/router.ts`)

A composable path-routing system. A `Router<I, O>` is `(i: I) => PromiseOr<Result<O>>` where `Result` is either `Ok<O>` or `RouteNotFound`. Key combinators:

| Export | Behavior |
|--------|----------|
| `select` | Tries each child router in order, returns the first `Ok`; implements `Doc` and `Completable` by aggregating child docs/candidates |
| `match(token, child)` | Matches a literal path segment, advances to `child`; completion candidate is the literal token itself |
| `param(name, child)` | Captures the next path segment as a named param, advances to `child`; implements `Doc` by delegating to child; no completion candidates (use `completing` instead) |
| `completing(fn, name, child)` | Like `param`, but carries a completion thunk `fn(params) => string[]` called when no token is consumed yet |
| `when(pred, name, child)` | Like `param`, but only captures if the token satisfies `pred` (and is not EOP) |
| `rest(name, child)` | Captures all remaining tokens before EOP as a single space-joined param, then advances to `[EOP]`; used for variadic arguments like `search <query>` |
| `terminal(cb)` | Succeeds only when the next token is EOP; calls `cb` and wraps result in `ok` |
| `route(path, value)` | Constructs a `Route` by splitting `path` on `/` into tokens |
| `ok` / `routeNotFound` | Result constructors |
| `doc(command, description, router)` | Wraps a router with a `Doc` annotation; `command` and `description` are used by `helpText`; propagates `Completable` and `_literalToken` from the wrapped router |
| `helpText(router)` | Extracts all `Doc` annotations from a router tree and formats them as an aligned command listing |
| `completionCandidates(router, tokens)` | Walks the router consuming `tokens` one by one and returns completion candidates for the next position; literal `match` nodes take priority over wildcard `completing`/`param` nodes in `select` |

### Entry point (`src/index.ts`)

Builds a `Router` directly from the todo store using `select`/`match`/`param`/`completing`/`when`/`rest`/`terminal`/`doc`, then calls it with `route(process.argv.slice(2).join('/'), '')`. Passing no arguments or an unrecognised route prints help via `helpText(router)`. Routes:

| Command | Description |
|---------|-------------|
| `--help` / `-h` | Print help listing all commands (also shown when no args given or route not found) |
| `--version` / `-v` | Print the version from `package.json` |
| `--upgrade` | Fetch the latest GitHub Release for `t4sty-it/todos`, compare to current version, download the platform-appropriate binary, atomically replace `process.execPath`, and regenerate the bash completion script; no auth required (public repo) |
| `completions bash` | Print a bash completion script (`eval "$(todos completions bash)"`) |
| `completions query <cword> <words...>` | Internal: return newline-separated completion candidates for the given cursor position; called by the completion script |
| `all` | List all todos as an aligned table with datetimes |
| `fields` | List available fields |
| `views` | List available view names |
| `values/<field>` | List values for a field |
| `with/<field>/<value>` | Filter todos by field value, table format; empty string matches absent/empty fields |
| `view/<name>` | Apply a named view from config, table format |
| `search <query>` | Search todos by content; exact matches first, then fuzzy |
| `init` | Initialize a new todos project: creates `todos/` and `todosConfig.json` from the sample template; errors if either already exists |
| `create <slug>` | Create a todo (type defaults to `task`) |
| `create <type> <slug>` | Create a todo with a given type |
| `create <slug> #<tags>` | Create a todo with comma-separated tags |
| `create <type> <slug> #<tags>` | Create a todo with type and tags |
| `<id>` | Show full detail for a single todo (all fields, description, dates) |
| `<id> edit` | Open the todo file in the configured editor; shows updated detail on exit |
| `<id> tag add <tag>` | Add a tag to a todo (idempotent) |
| `<id> tag remove <tag>` | Remove a tag from a todo |
| `<id> set <field> <value>` | Set a field on a todo (`id`, `url`, `createdAt`, `updatedAt` are read-only) |
| `<id> history` | Show git commit history for a todo with colorized diffs |

Tags tokens are distinguished from type/slug tokens by a leading `#`.

Listing commands (`all`, `with`, `view`, `search`) render via `tableDisplay(todos)`, which resolves all date thunks in parallel, then formats output as a fixed-width table with columns: `#id`, `title`, `created → updated` (datetimes in local time, `YYYY-MM-DD HH:MM`). `create` and `set` use `shortDisplay` (compact, no dates).

**Search** (`search <query>`): reads every todo file in full (bypassing the meta cache, so description is included). Returns two deduped sections concatenated: (1) exact matches — todos whose searchable text (title + description + status + type + tags + all extraFields values) contains the query as a literal substring (case-insensitive); (2) fuzzy matches — todos matching a regex built by interleaving each character of the query with `.*` (e.g. `"srch"` → `/s.*r.*c.*h/i`). Special regex characters in the query are escaped before building the pattern. Multi-word queries (e.g. `search hello world`) are passed as a single string, so exact matching looks for the phrase `"hello world"` and fuzzy matching builds the pattern from all characters including the space.

**History** (`<id> history`): runs `git log` to list all commits that touched the todo file, newest first. For each commit, runs `git show --format= --no-color -p` to retrieve the raw patch. `formatHistoryDate` parses the git ISO 8601 author date string and formats it as `YYYY-MM-DD HH:MM GMT±N` using the author's timezone offset. `formatDiff` strips file-header lines (`diff --git`, `index`, `---`, `+++`, `new file`, `deleted file`), indents each remaining line 4 spaces, and applies ANSI background colors — green (`\x1b[42m`) for added lines, red (`\x1b[41m`) for removed lines, dim (`\x1b[2m`) for hunk headers.

### Utilities

- `src/utils/useCache.ts` — simple memoize-once wrapper; used by the store (todos read once per run) and `metaCache.ts` (meta cache built once per run)
- `src/io.ts` — `write` (stdout) and `prompt` (read one line from stdin)

### Release (`scripts/release.ts`)

Run via `bun run release <version>`. Validates the semver arg, bumps `package.json`, commits it (`git commit -m <version>`) and tags that commit (`git tag <version>`), pushes the commit and tag to the remote (auto-detected via `git remote`), cross-compiles five standalone binaries into `dist/` using Bun's `--target` flag (`bun-linux-x64`, `bun-linux-arm64`, `bun-darwin-x64`, `bun-darwin-arm64`, `bun-windows-x64`), then calls `gh release create <version> dist/todos-* --generate-notes` to publish them against the already-pushed tag. Requires `gh` authenticated (`gh auth login`). Tags are bare versions (e.g. `0.28.0`, not `v0.28.0`). The commit+tag must be pushed *before* `gh release create` runs, otherwise GitHub creates the release tag against the previous commit on the default branch instead of the new version bump (this caused the `0.28.0` tag to point at the wrong commit).
