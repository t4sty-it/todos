import { parse, patch, stringify, type Todo } from "./todos";

import { readdir, writeFile } from 'node:fs/promises';
import { useCache } from "./utils/useCache";

export interface TodoStore {
  all(): Promise<Todo[]>,
  fields(): Promise<(keyof Todo)[]>,
  fieldValues(field: keyof Todo): Promise<string[]>,
  filterBy(field: keyof Todo, value: string): Promise<Todo[]>,
  set(id: string, field: keyof Todo, value: string): Promise<Todo>,
  create(slug: string): Promise<Todo>
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
      return (await todos()).filter(todo =>
        typeof todo[field] === 'string'
        ? todo[field] == value
        : Array.isArray(todo[field])
          ? todo[field].includes(value)
          : false
      )
    },
    create: async (slug) => {
      const all = await todos()
      const maxId = all.reduce((max, t) => Math.max(max, parseInt(t.id) || 0), 0)
      const newId = String(maxId + 1)
      const url = `${newId}-${slug}.md`
      const title = slug.replace(/-/g, ' ')
      const todo: Todo = { id: newId, url, title, status: 'new', type: 'task', tags: ['untagged'] }
      await writeFile(`${mainFolder}/${url}`, stringify(todo))
      todos = useCache(() => listFolder(mainFolder))
      return todo
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
        .then(text => parse(text, f)))
  )
}