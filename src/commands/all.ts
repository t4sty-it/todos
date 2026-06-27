import { doc, match, terminal, type Route, type Router } from "@/utils/router"
import type { Config } from "@/config"
import type { TodoStore } from "@/todoStore"
import { tableDisplay } from "@/display"

export const all = (todos: TodoStore, config: Config): Router<Route<string>, string> =>
  doc('all', 'List all todos as a table with timestamps',
    match('all', terminal(_ => todos.all().then(ts => tableDisplay(ts, config))))
  )
