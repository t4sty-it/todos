import pkg from '../package.json'
import { write } from "./io"
import type { Todo } from "./todos"
import { useTodoStore } from "./todoStore"
import { applyDisplay } from "./config"
import { useConfigStore } from "./configStore"
import { completing, completionCandidates, doc, helpText, match, param, rest, route, select, terminal, when, type Route, type Router } from "./utils/router"
import { findProjectRoot } from "./utils/findProjectRoot"
import { isAbsolute, dirname, relative } from "node:path"

const root = findProjectRoot(process.cwd())
if (root) process.chdir(root)

const todos = useTodoStore()
const config = await useConfigStore().get()

const runGit = (args: string[]): Promise<string> => {
  const proc = Bun.spawn(['git', ...args], { stdout: 'pipe', stderr: 'pipe' })
  return new Response(proc.stdout).text()
}

const bashCompletionScript = `\
_todos_complete() {
  COMPREPLY=(\$(compgen -W "\$(todos completions query \$COMP_CWORD "\${COMP_WORDS[@]}" 2>/dev/null)" -- "\${COMP_WORDS[COMP_CWORD]}"))
}
complete -F _todos_complete todos`

const word = <O>(name: string, child: Router<any, O>) => when((t: string) => !t.startsWith('#'), name, child)
const tag  = <O>(name: string, child: Router<any, O>) => when((t: string) =>  t.startsWith('#'), name, child)
const parseTags = (s: string) => s.replace(/^#/, '').split(',').map(t => t.trim())
const readonlyFields = new Set(['id', 'url', 'createdAt', 'updatedAt'])

const router: Router<Route<string>, string> = select(
  doc('--help, -h', 'Print help',
    select(
      match('--help', terminal(_ => helpText(router))),
      match('-h',     terminal(_ => helpText(router))),
    )
  ),

  doc('--version, -v', 'Print version',
    select(
      match('--version', terminal(_ => pkg.version)),
      match('-v',        terminal(_ => pkg.version)),
    )
  ),

  doc('completions bash', 'Print bash completion script (eval "$(todos completions bash)")',
    match('completions',
      select(
        match('bash', terminal(_ => bashCompletionScript)),
        match('query',
          param('cword',
            rest('args', terminal(async r => {
              const cword = parseInt(r.params['cword']!)
              const words = (r.params['args'] ?? '').split(' ').filter(Boolean)
              const preceding = words.slice(1, cword)
              return (await completionCandidates(router, preceding)).join('\n')
            }))
          )
        ),
      )
    )
  ),

  doc('all', 'List all todos as a table with timestamps',
    match('all', terminal(_ => todos.all().then(tableDisplay)))
  ),

  doc('fields', 'List available fields',
    match('fields', terminal(_ => todos.fields().then(writeList)))
  ),

  doc('values <field>', 'List values for a field',
    match('values',
      completing(() => todos.fields(), 'field',
        terminal(r => todos.fieldValues(r.params['field'] as keyof Todo).then(writeList))
      ))
  ),

  doc('with <field> <value>', 'Filter todos by field value (empty string matches absent/empty)',
    match('with',
      completing(() => todos.fields(), 'field',
        completing(p => todos.fieldValues(p['field'] as keyof Todo), 'value',
          terminal(r => todos.filterBy(
            r.params['field'] as keyof Todo,
            r.params['value']!
          ).then(tableDisplay))
        )
      )
    )
  ),

  doc('views', 'List available view names',
    match('views', terminal(_ => writeList(Object.keys(config.views ?? {}))))
  ),

  doc('view <name>', 'Apply a named view from config',
    match('view',
      completing(() => Object.keys(config.views ?? {}), 'name',
        terminal(r => {
          const view = config.views?.[r.params['name']!]
          if (!view) {
            const available = Object.keys(config.views ?? {}).join(', ') || 'none'
            return `Unknown view: "${r.params['name']}" (available: ${available})`
          }
          return todos.view(view).then(tableDisplay)
        })
      )
    )
  ),

  doc('search <query>', 'Search todos by content (exact matches first, then fuzzy)',
    match('search',
      rest('query',
        terminal(r => {
          const q = r.params['query']!
          if (!q) return 'Usage: todos search <query>'
          return todos.search(q).then(tableDisplay)
        })
      )
    )
  ),

  doc('create [<type>] <slug> [#<tags>]', 'Create a new todo (type defaults to task)',
    match('create', select(
      word('type', word('slug', tag('tags', terminal(r => todos.create(r.params['slug']!, r.params['type'], parseTags(r.params['tags']!)).then(shortDisplay))))),
      word('type', word('slug',              terminal(r => todos.create(r.params['slug']!, r.params['type']             ).then(shortDisplay)))),
      word('slug',           tag('tags', terminal(r => todos.create(r.params['slug']!, undefined,    parseTags(r.params['tags']!)).then(shortDisplay)))),
      word('slug',                        terminal(r => todos.create(r.params['slug']!                                 ).then(shortDisplay))),
    ))
  ),

  completing(() => todos.fieldValues('id' as keyof Todo), 'id',
    select(
      doc('<id> history', 'Show git history for a todo with diffs',
        match('history', terminal(r => historyDisplay(r.params['id']!)))
      ),
      doc('<id> set <field> <value>', 'Set a field on a todo (id/url/createdAt/updatedAt are read-only)',
        match('set',
          completing(
            () => todos.fields().then(fs => fs.filter(f => !readonlyFields.has(f))),
            'field',
            completing(p => todos.fieldValues(p['field'] as keyof Todo), 'value',
              terminal(r => todos.set(
                r.params['id']!,
                r.params['field'] as keyof Todo,
                r.params['value']!
              ).then(shortDisplay))
            )
          )
        )
      ),
      doc('<id> edit', 'Open the todo file in the configured editor',
        match('edit', terminal(async r => {
          const editor = config.editor ?? process.env.EDITOR
          if (!editor) return 'No editor configured. Set "editor" in todosConfig.json or $EDITOR.'
          const todo = await todos.get(r.params['id']!)
          const proc = Bun.spawn([...editor.split(/\s+/), todo.url], { stdin: 'inherit', stdout: 'inherit', stderr: 'inherit' })
          await proc.exited
          todos.reload()
          return detailDisplay(await todos.get(r.params['id']!))
        }))
      ),
      doc('<id> tag add <tag>', 'Add a tag to a todo (idempotent)',
        match('tag', match('add', completing(() => todos.fieldValues('tags' as keyof Todo), 'tag',
          terminal(r => todos.tag(r.params['id']!, 'add', r.params['tag']!).then(shortDisplay))
        )))
      ),
      doc('<id> tag remove <tag>', 'Remove a tag from a todo',
        match('tag', match('remove', completing(() => todos.fieldValues('tags' as keyof Todo), 'tag',
          terminal(r => todos.tag(r.params['id']!, 'remove', r.params['tag']!).then(shortDisplay))
        )))
      ),
      doc('<id>', 'Show full detail for a todo',
        terminal(r => todos.get(r.params['id']!).then(detailDisplay))
      ),
    )
  ),
)

function writeList(x: string[]): string {
  return x.join('\n')
}

const pad = (n: number) => String(n).padStart(2, '0')
const fmt = (d: Date | undefined) => d
  ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  : '—'

function shortDisplay(todo: Todo): string {
  return applyDisplay(`#${todo.id} - ${todo.title}`, todo as unknown as Record<string, unknown>, config)
}

async function detailDisplay(todo: Todo): Promise<string> {
  const [created, updated] = await Promise.all([todo.createdAt?.(), todo.updatedAt?.()])
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

function formatHistoryDate(isoDate: string): string {
  const m = isoDate.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}):\d{2}(Z|[+-]\d{2}:\d{2})$/)
  if (!m) return isoDate
  const [, date, time, tz] = m
  let tzStr: string
  if (tz === 'Z') {
    tzStr = 'UTC'
  } else {
    const tzm = tz!.match(/([+-])(\d{2}):(\d{2})$/)!
    const h = parseInt(tzm[2]!, 10), mins = parseInt(tzm[3]!, 10)
    tzStr = `GMT${tzm[1]}${h}${mins ? ':' + tzm[3] : ''}`
  }
  return `${date} ${time} ${tzStr}`
}

function formatDiff(diffText: string): string {
  const BG_GREEN = '\x1b[42m', BG_RED = '\x1b[41m', DIM = '\x1b[2m', RESET = '\x1b[0m'
  return diffText.trim().split('\n')
    .filter(line =>
      !line.startsWith('diff --git') && !line.startsWith('index ') &&
      !line.startsWith('--- ') && !line.startsWith('+++ ') &&
      !line.startsWith('new file') && !line.startsWith('deleted file')
    )
    .map(line => {
      const indent = '    '
      if (line.startsWith('+')) return `${indent}${BG_GREEN}${line}${RESET}`
      if (line.startsWith('-')) return `${indent}${BG_RED}${line}${RESET}`
      if (line.startsWith('@@')) return `${indent}${DIM}${line}${RESET}`
      return `${indent}${line}`
    })
    .join('\n')
    .trimEnd()
}

async function historyDisplay(todoId: string): Promise<string> {
  const todo = await todos.get(todoId)
  const filePath = todo.url

  let gitCwd = process.cwd()
  let filePathForGit = filePath
  if (isAbsolute(filePath)) {
    const proc = Bun.spawn(['git', '-C', dirname(filePath), 'rev-parse', '--show-toplevel'], { stdout: 'pipe', stderr: 'pipe' })
    const gitRoot = (await new Response(proc.stdout).text()).trim()
    if (gitRoot) {
      gitCwd = gitRoot
      filePathForGit = relative(gitRoot, filePath)
    }
  }

  const runGitHere = (args: string[]) => {
    const proc = Bun.spawn(['git', ...args], { cwd: gitCwd, stdout: 'pipe', stderr: 'pipe' })
    return new Response(proc.stdout).text()
  }

  const logOutput = await runGitHere(['log', '--format=%H%n%an%n%aI', '--', filePathForGit])
  const lines = logOutput.trim().split('\n').filter(Boolean)
  if (lines.length === 0) return 'No history found (file not committed yet).'

  const commits: { hash: string, author: string, isoDate: string }[] = []
  for (let i = 0; i + 2 < lines.length; i += 3)
    commits.push({ hash: lines[i]!, author: lines[i + 1]!, isoDate: lines[i + 2]! })

  const sections = await Promise.all(commits.map(async ({ hash, author, isoDate }) => {
    const header = `${formatHistoryDate(isoDate)} - ${author}`
    const diffText = await runGitHere(['show', '--format=', '--no-color', '-p', hash, '--', filePathForGit])
    const diff = formatDiff(diffText)
    return diff ? `${header}\n${diff}` : header
  }))

  return sections.join('\n\n')
}


const args = process.argv.slice(2)
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