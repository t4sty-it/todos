---
status: TBD
type: feature
tags:
  - untagged
---
# multi field filter

Extend `todos with` to accept multiple `<field> <value>` pairs joined by AND logic, e.g.:

```
todos with status new type bug
todos with status new priority high type feature
```

Currently only a single field/value pair is accepted. The extended form should filter todos that match **all** supplied conditions — equivalent to the `include` logic in named views, but ad-hoc from the CLI.

The router needs to consume pairs of tokens until EOP rather than exactly one pair. Tab completion should suggest field names at even positions and field values at odd positions.
