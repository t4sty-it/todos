import { existsSync } from "node:fs"
import { dirname, join } from "node:path"

export const findProjectRoot = (from: string): string | undefined => {
  let dir = from
  while (!existsSync(join(dir, 'todos')) && !existsSync(join(dir, 'todosConfig.json'))) {
    const parent = dirname(dir)
    if (parent === dir) return undefined
    dir = parent
  }
  return dir
}
