import { parse, type Todo } from "./todos";

import { readdir } from 'node:fs/promises';
import { useCache } from "./utils/useCache";

export interface TodoStore {
  all(): Promise<Todo[]>,
  fields(): Promise<(keyof Todo)[]>,
  fieldValues(field: keyof Todo): Promise<string[]>,
  filterBy(field: keyof Todo, value: string): Promise<Todo[]>
}

const mainFolder = 'todos'

export const useTodoStore = (): TodoStore => {

  const todos = useCache(() => listFolder(mainFolder))

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