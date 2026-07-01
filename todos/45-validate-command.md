---
status: TBD
type: feature
tags:
  - untagged
---
# validate command

New subcommand `todos validate` that checks the health of the todo project and reports problems:

1. **Broken cross-references** — `#<id>` patterns in any todo's content that point to a non-existent todo ID
2. **Duplicate IDs** — multiple files sharing the same numeric prefix (currently a warning on every listing; `validate` surfaces these clearly)
3. **Required fields** — configurable via `todosConfig.json` `"required"` key, e.g. `{ "required": ["status", "type"] }`; reports todos missing any required field
4. **Invalid field values** — configurable via `todosConfig.json` `"allowed"` key, e.g. `{ "allowed": { "status": ["new", "done", "closed"] } }`; reports todos with out-of-range values

Exit code 0 if all checks pass, non-zero if any issues found — making it usable in CI (`todos validate || exit 1`).

Output format: one issue per line with `#id - <title>: <problem>`. Respects `--json`.
