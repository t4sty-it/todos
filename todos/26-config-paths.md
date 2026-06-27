---
status: new
type: feature
tags:
  - untagged

---
# config pahts

the configuration should accept a new field, "paths", of type string array, that define search paths for todos.
If the field is absent or empty, assume the current default of "todos".
If the field is present, it must override the default "todos" folder.

## Paths under different git repositories

The configuration must support paths tracked under different repositories