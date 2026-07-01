import { parse as yaml, stringify as toYaml } from 'yaml'
import { basename } from 'node:path'

export const FILENAME_RE = /^(\d+)-.+\.md$/

export interface Todo {
  id: string
  url: string
  title: string
  description?: string
  status?: string
  type?: string
  tags?: string[]
  extraFields?: Record<string, string | string[]>
  createdAt?: () => Promise<Date | undefined>
  updatedAt?: () => Promise<Date | undefined>
}

export const parse = (text: string, url: string): Todo => ({
  id: FILENAME_RE.exec(basename(url))![1]!,
  url,
  title: parseTitle(text),
  description: parseDescription(text),
  ...parseFrontMatter(text, url)
})

const frontMatterRegex = /^---$((.*)\n)*---$/m
const titleRegex = /^# (.*)$/m

const YAML_BUILTIN_FIELDS = new Set(['status', 'type', 'tags'])
const RESERVED_FIELDS = new Set(['title', 'description', 'id', 'url', 'createdAt', 'updatedAt', 'extraFields'])

const parseFrontMatter = (text: string, url: string): Partial<{status: string, type: string, tags: string[], extraFields: Record<string, string | string[]>}> => {
  const match = frontMatterRegex.exec(text)
  if (match == null) return {}

  const fm = match[0].replace(/^---$/gm, '')
  const obj = (yaml(fm) ?? {}) as Record<string, unknown>

  if (typeof obj.tags === 'string')
    obj.tags = (obj.tags as string).split(',').map(s => s.trim())

  const extraFields: Record<string, string | string[]> = {}
  for (const [key, val] of Object.entries(obj)) {
    if (YAML_BUILTIN_FIELDS.has(key)) continue
    if (RESERVED_FIELDS.has(key)) {
      process.stderr.write(`Warning: ${url}: front matter key "${key}" is reserved and will be ignored\n`)
      continue
    }
    if (typeof val === 'string') extraFields[key] = val
    else if (Array.isArray(val) && val.every(v => typeof v === 'string')) extraFields[key] = val as string[]
  }

  const known: Partial<{status: string, type: string, tags: string[]}> = {
    status: typeof obj.status === 'string' ? obj.status : undefined,
    type: typeof obj.type === 'string' ? obj.type : undefined,
    tags: Array.isArray(obj.tags) ? obj.tags as string[] : undefined,
  }

  return Object.keys(extraFields).length > 0
    ? { ...known, extraFields }
    : known
}

export const parseTitle = (text: string) => titleRegex.exec(text)?.at(1) ?? ''

export const extractRefs = (text: string): string[] =>
  [...new Set([...text.matchAll(/(?<!\d)#(\d+)(?!\d)/g)].map(m => m[1]!))]
const parseDescription = (text: string) => {
  const lines = text.split('\n')
  const titleLineIdx = lines.findIndex(line => line.startsWith('# '))
  if (titleLineIdx !== -1) return lines.slice(titleLineIdx + 1).join('\n')
  const fmEndIdx = lines.indexOf('---', 1)
  return fmEndIdx === -1 ? text : lines.slice(fmEndIdx + 1).join('\n')
}

export const stringify = (todo: Todo): string => {
  const frontmatter = '---\n' + toYaml({status: todo.status, type: todo.type, tags: todo.tags, ...(todo.extraFields ?? {})}) + '\n---'
  const title = '# ' + todo.title

  return [frontmatter, title, todo.description].join('\n')
}

export const patch = (text: string, field: string, value: string | string[]): string => {
  const fmMatch = frontMatterRegex.exec(text)
  if (!fmMatch) throw new Error('No front matter')

  const rawFm = yaml(fmMatch[0].replace(/^---$/gm, '')) as Record<string, any>
  rawFm[field] = value

  return text.replace(fmMatch[0], '---\n' + toYaml(rawFm) + '---')
}