import { write } from "./io"
import { useTodoStore } from "./todoStore"
import { useConfigStore } from "./configStore"
import { helpText, route, select, type Route, type Router } from "./utils/router"
import { findProjectRoot } from "./utils/findProjectRoot"
import { help } from './commands/help'
import { version } from './commands/version'
import { completions } from './commands/completions'
import { all } from './commands/all'
import { fields } from './commands/fields'
import { values } from './commands/values'
import { withFilter } from './commands/with'
import { views } from './commands/views'
import { view } from './commands/view'
import { search } from './commands/search'
import { create } from './commands/create'
import { todo } from './commands/todo'

const root = findProjectRoot(process.cwd())
if (root) process.chdir(root)

const todos = useTodoStore()
const config = await useConfigStore().get()

const args = process.argv.slice(2)
if (args.includes('--json')) {
  config.json = true
  args.splice(args.indexOf('--json'), 1)
}

const router: Router<Route<string>, string> = select(
  help(() => router),
  version,
  completions(() => router),
  all(todos, config),
  fields(todos),
  values(todos),
  withFilter(todos, config),
  views(config),
  view(todos, config),
  search(todos, config),
  create(todos, config),
  todo(todos, config),
)

if (args.length === 0) {
  write(helpText(router))
} else {
  try {
    const r = await router(route(args.join('/'), ''))
    if (r._tag === 'RouteNotFound') {
      write(helpText(router))
    } else {
      write(r.value)
    }
  } catch (e) {
    process.stderr.write(`Error: ${e instanceof Error ? e.message : e}\n`)
    process.exit(1)
  }
}
