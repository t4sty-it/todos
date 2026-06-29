import { completing, doc, match, terminal, type Route, type Router } from "@/utils/router"
import type { Config } from "@/config"
import type { TodoStore } from "@/todoStore"
import { jsonListDisplay, tableDisplay } from "@/display"

export const view = (todos: TodoStore, config: Config): Router<Route<string>, string> =>
  doc('view <name>', 'Apply a named view from config',
    match('view',
      completing(() => Object.keys(config.views ?? {}), 'name',
        terminal(r => {
          const v = config.views?.[r.params['name']!]
          if (!v) {
            const available = Object.keys(config.views ?? {}).join(', ') || 'none'
            return `Unknown view: "${r.params['name']}" (available: ${available})`
          }
          return todos.view(v).then(ts => config.json ? jsonListDisplay(ts) : tableDisplay(ts, config))
        })
      )
    )
  )
