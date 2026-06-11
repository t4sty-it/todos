import { write } from "./io"
import type { Todo } from "./todos"
import { useTodoStore } from "./todoStore"
import { applyDisplay } from "./config"
import { useConfigStore } from "./configStore"
import { match, ok, param, route, select, terminal, when, type Router } from "./utils/router"

const todos = useTodoStore()
const config = await useConfigStore().get()

const word = <O>(name: string, child: Router<any, O>) => when((t: string) => !t.startsWith('#'), name, child)
const tag  = <O>(name: string, child: Router<any, O>) => when((t: string) =>  t.startsWith('#'), name, child)
const parseTags = (s: string) => s.replace(/^#/, '').split(',')

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

  match('view',
    param('name',
      r => {
        const view = config.views?.[r.params['name']!]
        if (!view) return ok(`Unknown view: "${r.params['name']}"`)
        return todos.view(view)
          .then(todos => todos.map(shortDisplay))
          .then(writeList)
          .then(ok)
      }
    )
  ),

  match('create', select(
    word('type', word('slug', tag('tags', terminal(r => todos.create(r.params['slug']!, r.params['type'], parseTags(r.params['tags']!)).then(shortDisplay))))),
    word('type', word('slug',              terminal(r => todos.create(r.params['slug']!, r.params['type']             ).then(shortDisplay)))),
    word('slug',           tag('tags', terminal(r => todos.create(r.params['slug']!, undefined,    parseTags(r.params['tags']!)).then(shortDisplay)))),
    word('slug',                        terminal(r => todos.create(r.params['slug']!                                 ).then(shortDisplay))),
  )),

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
  return applyDisplay(`#${todo.id} - ${todo.title}`, todo as unknown as Record<string, unknown>, config)
}

const r = await router(route(process.argv.slice(2).join('/'), ''))
write(r.value)