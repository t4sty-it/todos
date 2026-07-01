---
status: TBD
type: feature
tags:
  - untagged
---
# stats command

New subcommand `todos stats` that prints a summary breakdown of the todo list:

- Total count
- Count per `status` value
- Count per `type` value
- Count per `tag` value (tags are multi-valued so a todo can appear in multiple buckets)

Example output:

```
Total: 45

Status
  new      12
  done     20
  closed    8
  ready     5

Type
  feature  18
  bug       9
  task     18

Tags
  untagged 30
  web       5
  cli      10
```

Respects `--json` for machine-readable output. Served from the meta cache (no file reads).
