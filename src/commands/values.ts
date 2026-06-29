import { completing, doc, match, terminal, type Route, type Router } from "@/utils/router"
import type { TodoStore } from "@/todoStore"
import { writeList } from "@/display"

export const values = (todos: TodoStore): Router<Route<string>, string> =>
  doc('values <field>', 'List values for a field',
    match('values',
      completing(() => todos.fields(), 'field',
        terminal(r => todos.fieldValues(r.params['field']!).then(writeList))
      ))
  )
