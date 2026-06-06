import path from "node:path";
import { parse, type Todo } from "./todos";
import { readdir, rm, symlink, mkdir } from 'node:fs/promises'
import { realpath } from "node:fs/promises";


/**
 * CACHE FOLDER STRUCTURE: 
 * .todos/<field>/<value>/<todo.id>
 */

export const cacheFolder = '.todos'
export const mainFolder = 'todos'

export const init = async () => {
  await rm(cacheFolder, { recursive: true, force: true})
  await mkdir(cacheFolder, {recursive: true})
  const todos = await list()
  for (const todo of todos) {
    for (const field in todo) {
      
      if (field == 'description') continue
      await mkdir(path.join(cacheFolder, field), { recursive: true })
      
      const fieldValue = todo[field as keyof Todo]
      if (!fieldValue) continue
      
      const values = Array.isArray(fieldValue) ? fieldValue : [fieldValue]
      for (const value of values) {
        await cacheTodoFieldValue(value, field, todo)
      }
    }
  }
}

const cacheTodoFieldValue = async (value: string, field: string, todo: Todo) => {
  await mkdir(path.join(cacheFolder, field, value.toString()), { recursive: true})
  await symlink(await realpath(path.join(mainFolder, todo.url)), path.join(cacheFolder, field, value.toString(), todo.id))
}

export const list = async (): Promise<Todo[]> => listFolder(mainFolder)

export const listFields = (): Promise<string[]> => readdir(path.join(cacheFolder))
export const listFieldValues = (field: string): Promise<string[]> => readdir(path.join(cacheFolder, field))

export const filterBy = async (field: string, value: string) => {
  await updateIndex(field)
  return listFolder(path.join(cacheFolder, field, value))
  // return list().then(todos => todos.filter(todo => todo[field as keyof Todo] === value))
}

export const listFolder = async (folderPath: string): Promise<Todo[]> => {
  const files = await readdir(folderPath)

  return Promise.all(
    files.map(f =>
      Bun.file(`todos/${f}`).text()
        .then(text => parse(text, f)))
  )
}

export const updateIndex = async (field: string): Promise<void> => {
  const folder = path.join(cacheFolder, field)
  await rm(folder, { recursive: true, force: true })
  const todos = await listFolder(mainFolder)
  await Promise.all(todos.map(async todo => {
    const finalFolder = path.join(folder, todo[field as keyof Todo] as string)
    await mkdir(finalFolder, {recursive: true}) // TODO: Support string[] values
    await symlink(
      path.join(mainFolder, todo.url),
      path.join(finalFolder, todo.url)
    )
  }))
}