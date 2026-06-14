---
status: ready
type: feature
tags:
  - untagged

---
# usage

Given the command `--help` or `-h` the application should output a help message that describes the various commands available.

Commands should be auto-documenting, meaning, the documentation should be specified in code rather than in specialized markdown or other files. This is probably to be accomplished by means of a specialized interface, Doc, with a single method, "document", that returns a string that describes the child. There should be then some function to annotate routers with docs, possibly via typescript decorators.

Calling the command --help then should run the main annotated router through a function to extract the annotations and write them out.