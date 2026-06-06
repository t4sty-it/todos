import { parse as yaml, stringify as toYaml } from 'yaml'

export interface Todo {
  id: string
  url: string
  title: string
  description?: string
  status?: string
  type?: string
  tags?: string[]
}

export const parse = (text: string, url: string): Todo => ({
  id: url.split('.').slice(0, -1).join('.'),
  url,
  title: parseTitle(text),
  description: parseDescription(text),
  ...parseFrontMatter(text)
})

const frontMatterRegex = () => /^---$((.*)\n)*---$/gm
const titleRegex = () => /^# (.*)$/gm

const parseFrontMatter = (text: string): Partial<{status: string, type: string, tags: string[]}> => {
  // text.match(/---\n(.*)\n---/)

  const match = frontMatterRegex().exec(text)
  if (match == null) return {}

  const fm = match[0]
    .replace(/^---$/gm, '')

  const obj = {...yaml(fm) as Record<string, any>}

  if (typeof obj.tags === 'string')
    obj.tags = obj.tags.split(',').map(s => s.trim())

  return obj
}

const parseTitle = (text: string) => titleRegex().exec(text)?.at(1) ?? ''
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