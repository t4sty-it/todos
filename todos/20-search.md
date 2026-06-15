---
status: done
type: actual-feature
tags:
  - untagged
---
# search

User should be able to search the todos with a fuzzy search: given the command
'search <...keywords>', the application should return the concatenation of 2 results:
1) exact matches: todos that contain the exact sequence typed by the user
2) fuzzy matches: todos whose content matches a regex formed by the search terms
with each character interleaved by '.*' (e.g. searching "hello" should yield todos matching
the regex h.*e.*l.*l.*o)
