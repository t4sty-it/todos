# todos

A CLI tool for browsing and filtering markdown-based todo files.

## Usage

### Initializing a new project

```bash
todos init
```

Run this once in an empty directory to create a `todos/` folder and a `todosConfig.json` pre-populated with a sample configuration. Errors if either already exists.

### Commands

Run from a directory that contains a `todos/` folder (or any ancestor that contains `todosConfig.json`):

```bash
todos --help                             # show this command listing
todos all                                # list all todos
todos view <name>                        # apply a named view (filter + sort defined in config)
todos fields                             # list available fields
todos values <field>                     # list all values for a field
todos with <field> <value>              # filter todos by field value
todos with <field> ""                    # filter todos where the field is absent or empty
todos search <query>                     # search todos by content (exact matches first, then fuzzy)
todos <id>                               # show full detail for a single todo
todos <id> edit                          # open the todo file in the configured editor
todos <id> tag add <tag>                # add a tag (idempotent)
todos <id> tag remove <tag>             # remove a tag
todos <id> set <field> <value>          # update a field on a todo (built-in or arbitrary; id/url/createdAt/updatedAt are read-only)
todos <id> history                       # show git commit history for a todo with colorized diffs
todos create <slug>                      # create a new todo (type: task, tags: untagged)
todos create <type> <slug>              # create with a given type
todos create <slug> #<tag1,tag2>        # create with given tags (whitespace around commas is trimmed)
todos create <type> <slug> #<tag1,tag2> # create with type and tags
```

Listing commands (`all`, `with`, `view`, `search`) output an aligned table:

```
#1   fix login bug        2025-10-01 09:30 → 2026-06-10 14:22
#4   add dark mode        2025-11-03 11:00 → 2026-06-01 08:45
#10  write release notes  2026-01-15 16:00 → 2026-06-12 16:51
```

Dates reflect when the file was first committed (`created`) and last committed (`updated`), derived from git history. They are cached in `.todos/meta.json` — add `.todos/` to your `.gitignore`.

### Search

`todos search <query>` searches across all todo content — title, description, status, type, tags, and any arbitrary fields — and returns two sets of results concatenated:

1. **Exact matches**: todos whose content contains the query as a literal substring (case-insensitive)
2. **Fuzzy matches**: todos whose content matches a regex built by interleaving each character of the query with `.*` — e.g. `todos search srch` matches any todo containing `search`, `scratch`, etc.

Exact matches are never repeated in the fuzzy section. Multi-word queries are treated as a single phrase for both exact and fuzzy matching.

### History

`todos <id> history` shows every git commit that touched the todo file, newest first. Each entry includes the commit date (in the author's local timezone), author name, and a colorized diff:

```
2026-06-15 21:46 GMT+2 - Federico Ceriani
    @@ -1,5 +1,5 @@
     ---
    -status: ready
    +status: done
     type: feature
```

- Lines added are highlighted with a **green background**
- Lines removed are highlighted with a **red background**
- Diff hunks are indented 4 spaces; file headers (`diff --git`, `---`, `+++`) are omitted

If running from source: `bun run src/index.ts` in place of `todos`.

## Tab completion

`todos` can generate its own bash completion script:

```bash
# activate in the current shell
eval "$(todos completions bash)"

# or install permanently (sourced automatically by bash-completion v2)
todos completions bash > ~/.bash_completion.d/todos
```

To make it permanent without relying on `~/.bash_completion.d/`, add the `eval` line to your `~/.bashrc`.

`bun run deploy` installs both the binary and the completion script automatically.

Completions are context-aware: field names, field values, view names, todo IDs, and subcommands are all suggested dynamically based on position.

## Todo file format

Todo files live in a `todos/` directory in the current working directory.

### Filename convention

```
<id>-<slug>.md
```

The numeric prefix before the first `-` is the todo's ID (e.g. `42-fix-login-bug.md` → id `42`). The slug after the `-` is free-form and for human readability only.

### File structure

```markdown
---
status: active
type: bug
tags: FE, BE
priority: high
---
# Title of the todo

Body / description goes here.
```

- **Front matter** (optional): YAML block between `---` delimiters. Built-in fields: `status`, `type`, `tags`. Any other field whose value is a string or list of strings is treated as an arbitrary field (see below).
- **Title**: the first `# Heading` line
- **Description**: everything after the title line

### `tags` field

Tags can be written as a comma-separated string or as a YAML list — both are accepted on read:

```yaml
tags: FE, BE         # read as ["FE", "BE"]
```

```yaml
tags:
  - FE
  - BE
```

### Arbitrary fields

Any YAML key whose value is a `string` or `string[]` is treated as an arbitrary field. Arbitrary fields are:

- listed by `todos fields`
- filterable with `todos with <field> <value>`
- viewable with `todos values <field>`
- settable with `todos <id> set <field> <value>`
- shown in `todos <id>` detail view
- included in `todos search` results
- usable in view `include`/`exclude`/`sort` conditions
- cached in `.todos/meta.json` (the cache rebuilds when the blob SHA changes)

```yaml
---
status: active
priority: high
team: backend
affected-versions:
  - v1.2
  - v1.3
---
```

When a field is updated with `set`, all other fields in the file are preserved exactly as written (no reformatting, no type coercion). `set` always writes the value as a string; use `edit` to set an array value.

## Configuration

Place a `todosConfig.json` file next to your `todos/` folder. The file is optional — if absent, output is unstyled.

### Paths

By default, todos are read from a `todos/` directory. You can configure one or more search paths:

```json
{ "paths": ["todos", "work-todos"] }
```

If `paths` is absent or empty, `todos/` is used. Paths may be relative to the project root or absolute — absolute paths allow aggregating todos from different git repositories:

```json
{ "paths": ["todos", "/home/user/personal-todos"] }
```

New todos are always created in the first configured path. The `findProjectRoot` heuristic now also recognizes `todosConfig.json` as a project root marker (useful when `todos/` is not the default).

### Editor

Set `"editor"` to the command used to open files. Falls back to `$EDITOR` if unset.

```json
{ "editor": "nvim" }
```

Multi-word commands work too: `"editor": "code --wait"`. The `<id> edit` command opens the todo's `.md` file in this editor and shows the updated detail view after you close it.

### Display colors and formatting

```json
{
  "display": {
    "type": {
      "bug":     "bold red",
      "feature": "blue"
    },
    "status": {
      "active": "bold",
      "closed": "gray"
    }
  }
}
```

Each key under `"display"` is a todo field (`type`, `status`, `tags`, …). Each value maps a field value to a style string — a space-separated list of tokens:

| Token | Effect |
|-------|--------|
| `bold` | Bold text |
| `dim` | Dimmed text |
| `italic` | Italic text |
| `underline` | Underlined text |
| `red`, `green`, `yellow`, `blue`, `magenta`, `cyan`, `white`, `gray`, `black` | Foreground color |

When a todo matches rules from more than one field, the styles are merged. For example, a todo with `type: feature` and `status: active` would display as bold blue.

### Views

Named views define reusable filtered and sorted slices of your todo list. Run them with `todos view <name>`.

```json
{
  "views": {
    "active-bugs": {
      "include": [{ "type": "bug" }, { "status": "active" }],
      "sort": ["priority asc", "id desc"]
    },
    "backlog": {
      "include": [{ "status": "new" }],
      "exclude": [{ "type": "spike" }],
      "sort": ["type asc", "id asc"]
    }
  }
}
```

- **`include`** — todo must match **all** listed conditions (AND)
- **`exclude`** — todo is dropped if it matches **any** listed condition (OR)
- **`sort`** — ordered list of sort keys; each entry is `"<field>"` or `"<field> asc|desc"` (defaults to `asc`)
