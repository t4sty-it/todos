export interface Menu {
  [k: string]: Menu | (() => Promise<void>)
}

export const walk = async <T>(
  menu: Menu,
  visit: (m: Menu, curPath: string[], resolve: (result: T) => void) => Promise<string[]>
): Promise<T | (() => void)> => {
  let path: string[] = []
  const getCurrentMenu = () => path.reduce((acc, cur) => {
    if (typeof acc != 'object' || acc[cur] == null) throw 'Wrong path: ' + path
    return acc[cur]
  }, menu as Menu | (() => Promise<void>))

  return new Promise(async resolve => {
    let currentMenu: Menu | (() => Promise<void>) = menu
    while (typeof currentMenu == 'object') {
      path = await visit(currentMenu, path, resolve)
      currentMenu = getCurrentMenu()
    }

    resolve(currentMenu)
  })
}