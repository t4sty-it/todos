import { write } from "./io"
import type { Todo } from "./todos"
import { useTodoStore } from "./todoStore"
import { match, ok, param, route, select, type Router } from "./utils/router"

const todos = useTodoStore()

const router: Router<any, string> = select(
  match('all', r => todos.all()
      .then(todos => todos.map(shortDisplay))
      .then(writeList)
      .then(ok)
  ),

  match('fields', r => todos.fields()
    .then(writeList)
    .then(ok)
  ),

  match('values',
    param('field',
      r => todos.fieldValues(r.params['field'] as keyof Todo)
        .then(writeList)
        .then(ok)
    )),

  match('with',
    param('field',
      param('value',
        r => todos.filterBy(
          r.params['field'] as keyof Todo,
          r.params['value']!
        )
        .then(todos => todos.map(shortDisplay))
        .then(writeList)
        .then(ok)
      )
    )
  ),

  param('id',
    match('set',
      param('field',
        param('value',
          r => todos.set(
            r.params['id']!,
            r.params['field'] as keyof Todo,
            r.params['value']!
          )
          .then(shortDisplay)
          .then(ok)
        )
      )
    )
  )
)

function writeList(x: string[]): string {
  return x.join('\n')
}

function shortDisplay(todo: Todo): string {
  return `#${todo.id} - ${todo.title}`
}

const r = await router(route(process.argv.slice(2).join('/'), ''))
write(r.value)