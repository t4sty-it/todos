import { parse, type Todo } from "./todos";
import { readdir } from 'node:fs/promises'


export const list = async (): Promise<Todo[]> => {
  const files = await readdir('todos')

  return Promise.all(
    files.map(f =>
      Bun.file(`todos/${f}`).text()
        .then(text => parse(text, f.split('.').slice(0, -1).join('.'))))
  )
} 