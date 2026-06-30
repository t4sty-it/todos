import { doc, match, terminal, type Route, type Router } from "@/utils/router"
import { applyView, type Config } from "@/config"
import type { TodoStore } from "@/todoStore"
import { jsonListDisplay, tableDisplay } from "@/display"

const defaultSort = { sort: ['id desc'] }

export const all = (todos: TodoStore, config: Config): Router<Route<string>, string> =>
  doc('all', 'List all todos as a table with timestamps',
    match('all', terminal(_ => todos.all().then(ts => {
      const sorted = applyView(ts, defaultSort)
      return config.json ? jsonListDisplay(sorted) : tableDisplay(sorted, config)
    })))
  )
