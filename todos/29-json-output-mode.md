---
status: new
type: feat
tags:
  - web
title: JSON output mode for reads
---
# JSON output mode for reads

Add a `--json` flag (or `json` output mode) so that listing commands (`all`, `with`, `view`, `search`, `<id>`) emit structured JSON instead of ANSI tables. Required foundation for the HTTP server — the web client needs machine-readable data, not coloured text.

Scope: reads only. Writes already mutate in-memory state; their output is incidental.
