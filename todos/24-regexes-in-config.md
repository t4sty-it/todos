---
status: new
type: feature
tags:
  - untagged

---
# regexes in config

Add support for regexes in "include" and "exclude" fields in view configuration in todosConfig.json.

e.g.

```json
{
  "views": {
    "milestones": {
      "include": [
        { "type": "milestone-.*"}
      ]
    }
  }
}
```

this would match tasks marked with type "milestone-mvp" and "milestone-nice-to-haves"