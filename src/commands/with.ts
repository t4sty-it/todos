import { completing, doc, match, terminal, type Route, type Router } from "@/utils/router"
import type { Todo } from "@/todos"
import type { Config } from "@/config"
import type { TodoStore } from "@/todoStore"
import { tableDisplay } from "@/display"

export const withFilter = (todos: TodoStore, config: Config): Router<Route<string>, string> =>
  doc('with <field> <value>', 'Filter todos by field value (empty string matches absent/empty)',
    match('with',
      completing(() => todos.fields(), 'field',
        completing(p => todos.fieldValues(p['field'] as keyof Todo), 'value',
          terminal(r => todos.filterBy(
            r.params['field'] as keyof Todo,
            r.params['value']!
          ).then(ts => tableDisplay(ts, config)))
        )
      )
    )
  )
