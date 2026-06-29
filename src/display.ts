import type { Todo } from "@/todos"
import type { Config } from "@/config"
import { applyDisplay } from "@/config"

export function writeList(x: string[]): string {
  return x.join('\n')
}

const pad = (n: number) => String(n).padStart(2, '0')
export const fmt = (d: Date | undefined) => d
  ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  : '—'

const flatFields = (todo: Todo): Record<string, unknown> =>
  ({ ...todo, ...(todo.extraFields ?? {}) }) as Record<string, unknown>

export function shortDisplay(todo: Todo, config: Config): string {
  return applyDisplay(`#${todo.id} - ${todo.title}`, flatFields(todo), config)
}

export async function detailDisplay(todo: Todo, config: Config): Promise<string> {
  const [created, updated] = await Promise.all([todo.createdAt?.(), todo.updatedAt?.()])
  const header = applyDisplay(`#${todo.id} - ${todo.title}`, flatFields(todo), config)
  const lines: string[] = [header, '─'.repeat(40)]

  if (todo.status)       lines.push(`status:  ${todo.status}`)
  if (todo.type)         lines.push(`type:    ${todo.type}`)
  if (todo.tags?.length) lines.push(`tags:    ${todo.tags.join(', ')}`)
  for (const [key, val] of Object.entries(todo.extraFields ?? {})) {
    lines.push(`${key.padEnd(8)} ${Array.isArray(val) ? val.join(', ') : val}`)
  }
  lines.push(`created: ${fmt(created)}`)
  lines.push(`updated: ${fmt(updated)}`)

  if (todo.description?.trim()) lines.push('', todo.description.trim())

  return lines.join('\n')
}

export async function tableDisplay(todos: Todo[], config: Config): Promise<string> {
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
      flatFields(todo),
      config
    )
  ).join('\n')
}

export function formatHistoryDate(isoDate: string): string {
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

export function formatDiff(diffText: string): string {
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
