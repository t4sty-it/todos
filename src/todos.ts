import { parse as yaml, stringify as toYaml } from 'yaml'

export interface Todo {
  id: string
  url: string
  title: string
  description?: string
  status?: string
  type?: string
  tags?: string[]
  createdAt?: () => Promise<Date | undefined>
  updatedAt?: () => Promise<Date | undefined>
}

export const parse = (text: string, url: string): Todo => ({
  id: url.split('-')[0]!,
  url,
  title: parseTitle(text),
  description: parseDescription(text),
  ...parseFrontMatter(text)
})

const frontMatterRegex = /^---$((.*)\n)*---$/m
const titleRegex = /^# (.*)$/m

const parseFrontMatter = (text: string): Partial<{status: string, type: string, tags: string[]}> => {
  const match = frontMatterRegex.exec(text)
  if (match == null) return {}

  const fm = match[0]
    .replace(/^---$/gm, '')

  const obj = {...yaml(fm) as Record<string, any>}

  if (typeof obj.tags === 'string')
    obj.tags = obj.tags.split(',').map(s => s.trim())

  return obj
}

export const parseTitle = (text: string) => titleRegex.exec(text)?.at(1) ?? ''
const parseDescription = (text: string) => {
  const lines = text.split('\n')
  const titleLineIdx = lines.findIndex(line => line.startsWith('# '))
  return lines.slice(titleLineIdx+1).join('\n')
}

export const stringify = (todo: Todo): string => {
  const frontmatter = '---\n' + toYaml({status: todo.status, type: todo.type, tags: todo.tags}) + '\n---'
  const title = '# ' + todo.title

  return [frontmatter, title, todo.description].join('\n')
}

export const patch = (text: string, field: keyof Todo, value: string | string[]): string => {
  const fmMatch = frontMatterRegex.exec(text)
  if (!fmMatch) throw new Error('No front matter')

  const rawFm = yaml(fmMatch[0].replace(/^---$/gm, '')) as Record<string, any>
  rawFm[field] = value

  return text.replace(fmMatch[0], '---\n' + toYaml(rawFm) + '---')
}