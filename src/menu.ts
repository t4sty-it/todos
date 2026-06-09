import { maybeApply, type ProviderOr } from "./utils/ProviderOr"

type PromiseOr<T> = T | Promise<T>
interface Meta { _meta: string }
const isMeta = <T extends Meta>(tag: string) => (x: any): x is T =>
  x != null && typeof x === 'object' && '_meta' in x && x._meta === tag


export interface Menu extends Meta {
  _meta: 'menu',
  value: {
    [k: string]: ProviderOr<PromiseOr<Menu | Prev | Cancel | Result<any>>>
  }
}

export const isMenu = isMeta<Menu>('menu')

export const menu = (value: Menu['value']): Menu => ({
  _meta: 'menu',
  value
})


interface Prev extends Meta { _meta: 'prev' }
export const isPrev = isMeta<Prev>('prev')
export const prev = (): Prev => ({ _meta: 'prev' })

interface Cancel extends Meta { _meta: 'cancel' }
export const isCancel = isMeta<Cancel>('cancel')
export const cancel = (): Cancel => ({ _meta: 'cancel' })


interface Result<T> extends Meta { _meta: 'result', value: T }
export const isResult = isMeta<Result<any>>('result')
export const result = <T>(t: T): Result<T> => ({ _meta: 'result', value: t })


export const run = async <T>(
  menu: Menu,
  visit: (
    current: Menu
  ) => Promise<Menu | Prev | Cancel | Result<any>>
): Promise<T | undefined> => {
  let path = [menu]

  while (path.at(-1)) {

    const step = path.shift()!

    const visitResult = await visit(step)

    if (isCancel(visitResult)) {
      return
    }

    if (isPrev(visitResult)) {
      continue
    }

    if (isMenu(visitResult)) {
      path.push(visitResult)
      continue
    }

    if (isResult(visitResult)) {
      return visitResult.value
    }
  }
}

export const walk = async (menu: Menu, path: string[]) => {

  const steps = [...path]
  let curMenu = menu

  while (steps.length > 0) {
    const step = steps.shift()!

    if (step in curMenu.value) {
      const stepResult = await (typeof curMenu.value[step] === 'function'
        ? curMenu.value[step]()
        : curMenu.value[step]
      )

      if (isResult(stepResult)) return stepResult.value
      if (isCancel(stepResult)) return
      if (isPrev(stepResult)) throw 'Cannot walk backwards'
      if (isMenu(stepResult)) curMenu = stepResult
    }
    else throw step

  }
}

export const stroll = async (menu: Menu, choose: (menu: Menu) => Promise<string>) => {
  const path: Menu[] = [menu]

  while (path.length > 0) {
    const curMenu = path.at(-1)!
    const choice = await choose(curMenu)

    if (choice in curMenu.value) {
      const choiceResult = await (typeof curMenu.value[choice] === 'function'
        ? curMenu.value[choice]()
        : curMenu.value[choice]
      )

      if (isResult(choiceResult)) return choiceResult.value
      if (isCancel(choiceResult)) return
      if (isPrev(choiceResult)) path.splice(path.length - 1, 1)
      if (isMenu(choiceResult)) path.push(choiceResult)
    }
    else throw 'Not a valid choice: ' + choice
  }
}

export const strafe = async (menu: Menu, choices: string[], choose: (menu: Menu) => Promise<string>) => {
  const steps: Menu[] = [menu]
  const _choices = [...choices]

  while (steps.length > 0) {
    const curMenu = steps.at(-1)!
    const choice = _choices.length > 0 ? _choices.shift()! : await choose(curMenu)

    if (choice in curMenu.value) {
      const choiceResult = await (typeof curMenu.value[choice] === 'function'
        ? curMenu.value[choice]()
        : curMenu.value[choice]
      )

      if (isResult(choiceResult)) {
        return choiceResult.value
      }
      if (isCancel(choiceResult)) { return }
      if (isPrev(choiceResult)) { steps.splice(steps.length - 1, 1) }
      if (isMenu(choiceResult)) { steps.push(choiceResult) }

    }
    else throw 'Not a valid choice: ' + choice
  }
}