import { doc, match, select, terminal, when, type Route, type Router } from "@/utils/router"
import type { Config } from "@/config"
import type { TodoStore } from "@/todoStore"
import { shortDisplay } from "@/display"

const parseTags = (s: string) => s.replace(/^#/, '').split(',').map(t => t.trim())
const word = <O>(name: string, child: Router<any, O>) => when((t: string) => !t.startsWith('#'), name, child)
const tag  = <O>(name: string, child: Router<any, O>) => when((t: string) =>  t.startsWith('#'), name, child)

export const create = (todos: TodoStore, config: Config): Router<Route<string>, string> =>
  doc('create [<type>] <slug> [#<tags>]', 'Create a new todo (type defaults to task)',
    match('create', select(
      word('type', word('slug', tag('tags', terminal(r => todos.create(r.params['slug']!, r.params['type'], parseTags(r.params['tags']!)).then(t => shortDisplay(t, config)))))),
      word('type', word('slug',              terminal(r => todos.create(r.params['slug']!, r.params['type']             ).then(t => shortDisplay(t, config))))),
      word('slug',           tag('tags', terminal(r => todos.create(r.params['slug']!, undefined,    parseTags(r.params['tags']!)).then(t => shortDisplay(t, config))))),
      word('slug',                        terminal(r => todos.create(r.params['slug']!                                 ).then(t => shortDisplay(t, config)))),
    ))
  )
