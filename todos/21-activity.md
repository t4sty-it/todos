---
status: ready
type: feature
tags:
  - untagged

---
# history

With the command `<todo id> history` the user should be able to list all updates made to the file, alongside the author of the change.

Updates should be printed in a nice and clear format, such as
```
2026-06-15 21:50 GMT+1 - John Doe
  <diff>
```

The diff should be user-friendly more than machine-friendly: use red background to show deletions and green background to show insertions. The diff should also be indented 4 spaces.

