import { doc, match, terminal, type Route, type Router } from "@/utils/router"
import type { TodoStore } from "@/todoStore"
import { writeList } from "@/display"

export const fields = (todos: TodoStore): Router<Route<string>, string> =>
  doc('fields', 'List available fields',
    match('fields', terminal(_ => todos.fields().then(writeList)))
  )
