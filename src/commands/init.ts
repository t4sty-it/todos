import { doc, match, terminal, type Route, type Router } from "@/utils/router"
import { mkdir, writeFile, access } from "node:fs/promises"
import sampleConfig from "../../assets/todosConfig.sample.txt"

const configFile = "todosConfig.json"
const todosDir = "todos"

const exists = (path: string) => access(path).then(() => true).catch(() => false)

export const init = (): Router<Route<string>, string> =>
  doc('init', 'Initialize a new todos project in the current directory',
    match('init', terminal(async () => {
      const [configExists, todosExists] = await Promise.all([exists(configFile), exists(todosDir)])

      if (configExists && todosExists) throw new Error(`Already initialized: ${configFile} and ${todosDir}/ already exist`)
      if (configExists) throw new Error(`Already initialized: ${configFile} already exists`)
      if (todosExists) throw new Error(`Already initialized: ${todosDir}/ already exists`)

      await Promise.all([
        mkdir(todosDir),
        writeFile(configFile, sampleConfig),
      ])

      return `Initialized todos project:\n  created ${todosDir}/\n  created ${configFile}`
    }))
  )
