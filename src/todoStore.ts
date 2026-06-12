import { parse, patch, stringify, type Todo } from "./todos";
import { applyView, type View } from "./config";

import { readdir, writeFile } from 'node:fs/promises';
import { useCache } from "./utils/useCache";
import { loadMetaCache } from "./metaCache";

export interface TodoStore {
  all(): Promise<Todo[]>,
  fields(): Promise<(keyof Todo)[]>,
  fieldValues(field: keyof Todo): Promise<string[]>,
  filterBy(field: keyof Todo, value: string): Promise<Todo[]>,
  get(id: string): Promise<Todo>,
  reload(): void,
  tag(id: string, op: 'add' | 'remove', tag: string): Promise<Todo>,
  set(id: string, field: keyof Todo, value: string): Promise<Todo>,
  create(slug: string, type?: string, tags?: string[]): Promise<Todo>,
  view(config: View): Promise<Todo[]>
}

const mainFolder = 'todos'

export const useTodoStore = (): TodoStore => {

  let todos = useCache(() => listFolder(mainFolder))

  return {
    all: () => todos(),
    fields: async () => {
      const result = new Set<keyof Todo>()
      await todos().then(todos => {
        for (const todo of todos) {
          if (todo.status) result.add('status')
          if (todo.tags) result.add('tags')
          if (todo.type) result.add('type')
        }
      })

      return result.values().toArray()
    },
    fieldValues: async field => {
      const result = new Set<string>()
      await todos().then(todos => {
        for (const todo of todos) {
          if (todo[field]) {
            if (typeof todo[field] == 'string')
              result.add(todo[field])
            if (Array.isArray(todo[field]))
              todo[field].forEach(value => result.add(value))
          }
        }
      })

      return result.values().toArray()
    },
    filterBy: async (field, value) => {
      return (await todos()).filter(todo => {
        const v = todo[field]
        if (value === '') return v == null || v === '' || (Array.isArray(v) && v.length === 0)
        return typeof v === 'string'
          ? v === value
          : Array.isArray(v)
            ? v.includes(value)
            : false
      })
    },
    create: async (slug, type = 'task', tags = ['untagged']) => {
      const all = await todos()
      const maxId = all.reduce((max, t) => Math.max(max, parseInt(t.id) || 0), 0)
      const newId = String(maxId + 1)
      const url = `${newId}-${slug}.md`
      const title = slug.replace(/-/g, ' ')
      const todo: Todo = { id: newId, url, title, status: 'new', type, tags }
      await writeFile(`${mainFolder}/${url}`, stringify(todo))
      todos = useCache(() => listFolder(mainFolder))
      return todo
    },
    get: async id => {
      const todo = (await todos()).find(t => t.id === id)
      if (!todo) throw new Error(`Todo not found: ${id}`)
      return todo
    },
    reload: () => { todos = useCache(() => listFolder(mainFolder)) },
    tag: async (id, op, tagName) => {
      const all = await todos()
      const todo = all.find(t => t.id === id)
      if (!todo) throw new Error(`Todo not found: ${id}`)

      const current = todo.tags ?? []
      const newTags = op === 'add'
        ? [...new Set([...current, tagName])].filter(t => t !== 'untagged')
        : current.filter(t => t !== tagName)

      const filePath = `${mainFolder}/${todo.url}`
      const text = await Bun.file(filePath).text()
      await writeFile(filePath, patch(text, 'tags', newTags))
      todos = useCache(() => listFolder(mainFolder))
      return { ...todo, tags: newTags }
    },
    view: async (viewConfig) => {
      const all = await todos()
      return applyView(all as unknown as Record<string, unknown>[], viewConfig) as unknown as Todo[]
    },
    set: async (id, field, value) => {
      const all = await todos()
      const todo = all.find(t => t.id === id)
      if (!todo) throw new Error(`Todo not found: ${id}`)

      const filePath = `${mainFolder}/${todo.url}`
      const text = await Bun.file(filePath).text()
      await writeFile(filePath, patch(text, field, value))
      todos = useCache(() => listFolder(mainFolder))
      return { ...todo, [field]: value }
    }
  }
}

const listFolder = async (folderPath: string): Promise<Todo[]> => {
  const files = await readdir(folderPath)

  return Promise.all(
    files.map(f =>
      Bun.file(`todos/${f}`).text()
        .then(text => {
          const todo = parse(text, f)
          todo.createdAt = () => loadMetaCache().then(m => m.get(f)?.createdAt)
          todo.updatedAt = () => loadMetaCache().then(m => m.get(f)?.updatedAt)
          return todo
        })
    )
  )
}