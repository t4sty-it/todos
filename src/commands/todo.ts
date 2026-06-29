import { completing, doc, match, select, terminal, type Route, type Router } from "@/utils/router"
import type { Config } from "@/config"
import type { TodoStore } from "@/todoStore"
import { detailDisplay, formatDiff, formatHistoryDate, jsonDetailDisplay, shortDisplay } from "@/display"
import { isAbsolute, dirname, relative } from "node:path"

const readonlyFields = new Set(['id', 'url', 'createdAt', 'updatedAt'])

async function historyDisplay(todoId: string, todos: TodoStore): Promise<string> {
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

  const runGit = (args: string[]) => {
    const proc = Bun.spawn(['git', ...args], { cwd: gitCwd, stdout: 'pipe', stderr: 'pipe' })
    return new Response(proc.stdout).text()
  }

  const logOutput = await runGit(['log', '--format=%H%n%an%n%aI', '--', filePathForGit])
  const lines = logOutput.trim().split('\n').filter(Boolean)
  if (lines.length === 0) return 'No history found (file not committed yet).'

  const commits: { hash: string, author: string, isoDate: string }[] = []
  for (let i = 0; i + 2 < lines.length; i += 3)
    commits.push({ hash: lines[i]!, author: lines[i + 1]!, isoDate: lines[i + 2]! })

  const sections = await Promise.all(commits.map(async ({ hash, author, isoDate }) => {
    const header = `${formatHistoryDate(isoDate)} - ${author}`
    const diffText = await runGit(['show', '--format=', '--no-color', '-p', hash, '--', filePathForGit])
    const diff = formatDiff(diffText)
    return diff ? `${header}\n${diff}` : header
  }))

  return sections.join('\n\n')
}

export const todo = (todos: TodoStore, config: Config): Router<Route<string>, string> =>
  completing(() => todos.fieldValues('id'), 'id',
    select(
      doc('<id> history', 'Show git history for a todo with diffs',
        match('history', terminal(r => historyDisplay(r.params['id']!, todos)))
      ),
      doc('<id> set <field> <value>', 'Set a field on a todo (id/url/createdAt/updatedAt are read-only)',
        match('set',
          completing(
            () => todos.fields().then(fs => fs.filter(f => !readonlyFields.has(f))),
            'field',
            completing(p => todos.fieldValues(p['field']!), 'value',
              terminal(r => todos.set(
                r.params['id']!,
                r.params['field']!,
                r.params['value']!
              ).then(t => shortDisplay(t, config)))
            )
          )
        )
      ),
      doc('<id> edit', 'Open the todo file in the configured editor',
        match('edit', terminal(async r => {
          const editor = config.editor ?? process.env.EDITOR
          if (!editor) return 'No editor configured. Set "editor" in todosConfig.json or $EDITOR.'
          const t = await todos.get(r.params['id']!)
          const proc = Bun.spawn([...editor.split(/\s+/), t.url], { stdin: 'inherit', stdout: 'inherit', stderr: 'inherit' })
          await proc.exited
          todos.reload()
          return detailDisplay(await todos.get(r.params['id']!), config)
        }))
      ),
      doc('<id> tag add <tag>', 'Add a tag to a todo (idempotent)',
        match('tag', match('add', completing(() => todos.fieldValues('tags'), 'tag',
          terminal(r => todos.tag(r.params['id']!, 'add', r.params['tag']!).then(t => shortDisplay(t, config)))
        )))
      ),
      doc('<id> tag remove <tag>', 'Remove a tag from a todo',
        match('tag', match('remove', completing(() => todos.fieldValues('tags'), 'tag',
          terminal(r => todos.tag(r.params['id']!, 'remove', r.params['tag']!).then(t => shortDisplay(t, config)))
        )))
      ),
      doc('<id>', 'Show full detail for a todo',
        terminal(r => todos.get(r.params['id']!).then(t => config.json ? jsonDetailDisplay(t) : detailDisplay(t, config)))
      ),
    )
  )
