---
status: new
type: feat
tags:
  - web
title: Web client
---
# Web client

Browser UI that talks to the `todos serve` HTTP API. Replaces the terminal for everyday browsing and editing.

Minimum viable scope:
- List view with filtering (mirrors `all` / `with` / `view`)
- Detail view with full description
- Inline editing (title, status, tags, arbitrary fields, description body)
- Create todo form

The `edit` flow is: web form → `PATCH /todos/:id` → server writes file → server commits → response. No local editor, no SSH, no pull needed.

Depends on #30 (HTTP server) and #31 (auto-commit).
