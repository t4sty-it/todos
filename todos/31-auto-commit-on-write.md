---
status: new
type: feat
tags:
  - web
title: Auto-commit writes to git
---
# Auto-commit writes to git

After each write mutation via the HTTP server (`create`, `set`, `tag`), run `git add <file> && git commit -m "todos: <action>"` so the repo stays in a clean committed state. Optionally `git push` afterward for remote sync.

Conflict strategy for solo use: last-write-wins, no pull needed (server is the canonical copy). Multi-user would need a rebase/retry loop — out of scope for now.

The `edit` command is replaced by the web form in this context; no file needs to be opened locally.

Depends on #30 (HTTP server).
