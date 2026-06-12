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
  match('all', _ => todos.all()
      .then(tableDisplay)
      .then(ok)
  ),

  match('fields', _ => todos.fields()
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
        .then(tableDisplay)
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
          .then(tableDisplay)
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
    select(
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
      ),
      terminal(r => todos.get(r.params['id']!).then(detailDisplay))
    )
  )
)

function writeList(x: string[]): string {
  return x.join('\n')
}

function shortDisplay(todo: Todo): string {
  return applyDisplay(`#${todo.id} - ${todo.title}`, todo as unknown as Record<string, unknown>, config)
}

async function detailDisplay(todo: Todo): Promise<string> {
  const [created, updated] = await Promise.all([todo.createdAt?.(), todo.updatedAt?.()])
  const pad = (n: number) => String(n).padStart(2, '0')
  const fmt = (d: Date | undefined) => d
    ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
    : '—'

  const header = applyDisplay(`#${todo.id} - ${todo.title}`, todo as unknown as Record<string, unknown>, config)
  const lines: string[] = [header, '─'.repeat(40)]

  if (todo.status)       lines.push(`status:  ${todo.status}`)
  if (todo.type)         lines.push(`type:    ${todo.type}`)
  if (todo.tags?.length) lines.push(`tags:    ${todo.tags.join(', ')}`)
  lines.push(`created: ${fmt(created)}`)
  lines.push(`updated: ${fmt(updated)}`)

  if (todo.description?.trim()) lines.push('', todo.description.trim())

  return lines.join('\n')
}

async function tableDisplay(todos: Todo[]): Promise<string> {
  const rows = await Promise.all(
    todos.map(async todo => {
      const [created, updated] = await Promise.all([todo.createdAt?.(), todo.updatedAt?.()])
      const pad = (n: number) => String(n).padStart(2, '0')
      const fmt = (d: Date | undefined) => d
        ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
        : '—'
      return { todo, id: `#${todo.id}`, title: todo.title, dates: `${fmt(created)} → ${fmt(updated)}` }
    })
  )
  const idWidth = Math.max(...rows.map(r => r.id.length))
  const titleWidth = Math.max(...rows.map(r => r.title.length))
  return rows.map(({ todo, id, title, dates }) =>
    applyDisplay(
      `${id.padEnd(idWidth)}  ${title.padEnd(titleWidth)}  ${dates}`,
      todo as unknown as Record<string, unknown>,
      config
    )
  ).join('\n')
}

const r = await router(route(process.argv.slice(2).join('/'), ''))
write(r.value)