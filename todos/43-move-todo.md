---
status: TBD
type: feature
tags:
  - untagged
---
# move todo

New subcommand `todos move <id> <path>` that moves a todo's `.md` file from its current configured path to another path listed in `config.paths`.

Use case: projects with multiple paths (e.g. `todos` and `work-todos`) where a todo was created in the wrong folder, or where a todo's scope changes and it should live in a different repo.

Steps:
1. Resolve the source file from the todo's current `url`
2. Construct the destination path (same filename, different root)
3. Move the file (`rename` / copy+delete)
4. Update the meta cache entry key to the new url
5. Print the updated detail view

The `todo.url` is updated in-memory; `createdAt`/`updatedAt` remain unchanged since they come from git log on the new path.
