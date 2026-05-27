import { list } from "./folder"
import { prompt, write } from "./io"
import { walk, type Menu } from "./menu"



const menu: Menu = {
  list: () => list().then(todos => todos.map(t => `#${t.id} - ${t.title}\n`).forEach(write))
}


const callFunction = (foo: Function) => foo()
const visit: (menu: Menu, curPath: string[], resolve: (foo: Function) => void) => Promise<string[]> =
async (menu, curPath, resolve) => {
  const choice = await prompt(
    Object.keys(menu).map(k => `- ${k}`).join('\n')
  )

  if (menu[choice] == null)
    throw `${choice} is not a valid choice`

  if (typeof menu[choice] == 'function') resolve(menu[choice])
  return [...curPath, choice]
}

await walk(menu, visit).then(callFunction)
