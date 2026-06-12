# todos

A CLI tool for browsing and filtering markdown-based todo files.

## Usage

Run from a directory that contains a `todos/` folder:

```bash
todos all                        # list all todos
todos view <name>                # apply a named view (filter + sort defined in config)
todos fields                     # list available fields
todos values <field>             # list all values for a field
todos with <field> <value>       # filter todos by field value
todos with <field> ""            # filter todos where the field is absent or empty
todos <id>                       # show full detail for a single todo
todos <id> edit                  # open the todo file in the configured editor
todos <id> tag add <tag>         # add a tag (idempotent)
todos <id> tag remove <tag>      # remove a tag
todos <id> set <field> <value>   # update a field on a todo
todos create <slug>                       # create a new todo (type: task, tags: untagged)
todos create <type> <slug>               # create with a given type
todos create <slug> #<tag1,tag2>         # create with given tags
todos create <type> <slug> #<tag1,tag2>  # create with type and tags
```

Listing commands (`all`, `with`, `view`) output an aligned table:

```
#1   fix login bug        2025-10-01 09:30 → 2026-06-10 14:22
#4   add dark mode        2025-11-03 11:00 → 2026-06-01 08:45
#10  write release notes  2026-01-15 16:00 → 2026-06-12 16:51
```

Dates reflect when the file was first committed (`created`) and last committed (`updated`), derived from git history. They are cached in `.todos/meta.json` — add `.todos/` to your `.gitignore`.

If running from source: `bun run src/index.ts` in place of `todos`.

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
---
# Title of the todo

Body / description goes here.
```

- **Front matter** (optional): YAML block between `---` delimiters. Supported fields: `status`, `type`, `tags`
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

When a field is updated with `set`, all other fields in the file are preserved exactly as written (no reformatting, no type coercion).

## Configuration

Place a `todosConfig.json` file next to your `todos/` folder. The file is optional — if absent, output is unstyled.

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
