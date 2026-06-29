---
status: new
type: feat
tags:
  - web
title: HTTP server mode (todos serve)
---
# HTTP server mode (todos serve)

New subcommand `todos serve [--port N]` that wraps the existing store in an HTTP API. The store already handles all reads and writes; this is a thin routing layer on top.

Suggested endpoints:
- `GET /todos` — all todos (JSON)
- `GET /todos/:id` — single todo with description
- `POST /todos` — create
- `PATCH /todos/:id` — set field / tag op
- `GET /fields`, `GET /fields/:field/values` — field introspection

Depends on #29 (JSON output) for response serialisation.
