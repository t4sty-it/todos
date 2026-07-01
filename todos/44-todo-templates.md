---
status: TBD
type: feature
tags:
  - untagged
---
# todo templates

Add a `templates` key to `todosConfig.json` that defines reusable todo skeletons:

```json
{
  "templates": {
    "bug": {
      "type": "bug",
      "status": "new",
      "tags": ["needs-triage"],
      "description": "## Steps to reproduce\n\n## Expected\n\n## Actual\n"
    },
    "feature": {
      "type": "feature",
      "status": "new",
      "description": "## Goal\n\n## Acceptance criteria\n\n"
    }
  }
}
```

Usage:

```
todos create --template bug login-fails-on-safari
todos create --template feature dark-mode
```

When `--template <name>` is given, `create` merges the template's fields over the defaults before writing the file. The slug/type/tags CLI args still override template values. If the template name is not found, error with a helpful message listing available templates.

Update `todosConfig.schema.json` and tab completions accordingly.
