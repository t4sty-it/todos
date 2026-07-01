---
status: TBD
type: feature
tags:
  - untagged
---
# delete command

New subcommand `todos delete <id>` that removes a todo's `.md` file from disk and evicts it from the meta cache.

Should prompt for confirmation before deleting (`Delete #40 - delete command? [y/N]`), with a `--force` / `-f` flag to skip the prompt for scripting.

After deletion the command prints a one-line confirmation and the meta cache entry is removed so subsequent listing commands no longer show the todo.
