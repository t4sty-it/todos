import { completing, doc, match, terminal, type Route, type Router } from "@/utils/router"
import { applyView, type Config } from "@/config"
import type { TodoStore } from "@/todoStore"
import { jsonListDisplay, tableDisplay } from "@/display"

const defaultSort = { sort: ['id desc'] }

export const withFilter = (todos: TodoStore, config: Config): Router<Route<string>, string> =>
  doc('with <field> <value>', 'Filter todos by field value (empty string matches absent/empty)',
    match('with',
      completing(() => todos.fields(), 'field',
        completing(p => todos.fieldValues(p['field']!), 'value',
          terminal(r => todos.filterBy(
            r.params['field']!,
            r.params['value']!
          ).then(ts => {
            const sorted = applyView(ts, defaultSort)
            return config.json ? jsonListDisplay(sorted) : tableDisplay(sorted, config)
          }))
        )
      )
    )
  )
