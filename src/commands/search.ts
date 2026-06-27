import { doc, match, rest, terminal, type Route, type Router } from "@/utils/router"
import type { Config } from "@/config"
import type { TodoStore } from "@/todoStore"
import { tableDisplay } from "@/display"

export const search = (todos: TodoStore, config: Config): Router<Route<string>, string> =>
  doc('search <query>', 'Search todos by content (exact matches first, then fuzzy)',
    match('search',
      rest('query',
        terminal(r => {
          const q = r.params['query']!
          if (!q) return 'Usage: todos search <query>'
          return todos.search(q).then(ts => tableDisplay(ts, config))
        })
      )
    )
  )
