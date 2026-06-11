# todos

A CLI tool for browsing and filtering markdown-based todo files.

## Usage

Run from a directory that contains a `todos/` folder:

```bash
todos all                        # list all todos
todos fields                     # list available fields
todos values <field>             # list all values for a field
todos with <field> <value>       # filter todos by field value
todos <id> set <field> <value>   # update a field on a todo
todos create <slug>              # create a new todo (status: new, type: task, tags: untagged)
```

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
