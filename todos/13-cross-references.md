---
status: closed
type: actual-feature
tags:
  - untagged
priority: low
---
# cross references

User should be able to reference other todos by simply adding a hashtag-id, e.g. this todo would be referenced as #13. The reference could be in the frontmatter (as a value of a field, not as a field itself), in the title or in the description.

We should then have another command available, `todos <id> references` that prints out a list of todos that reference <id>, e.g. to get which todos reference this todo you would just use `todos 13 references` (and this would print, among others, this same todo, as we are self-referencing - that's ok).

This would enable, for instance, marking todos that are blocking other todos by simply adding "blocks: #...", making it easier to determine which todos should be done first.