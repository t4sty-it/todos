export const EOP = '_EOP_'
type PromiseOr<T> = T | Promise<T>
export type Router<I, O> = (i: I) => PromiseOr<Result<O>>
export type Result<T> = Ok<T> | RouteNotFound
export type Ok<T> = {_tag: 'Ok', value: T}
function isOk(x: any): x is Ok<any> {
  return x != null && typeof x === 'object' && x['_tag'] === 'Ok'
}
export const ok = <T>(value: T): Ok<T> => ({_tag: 'Ok', value})
export type RouteNotFound = {_tag: 'RouteNotFound', value: string}
export const routeNotFound = (value: string): RouteNotFound => ({_tag: 'RouteNotFound', value})


export interface Doc {
  document(): string
}

export function doc<I, O>(command: string, description: string, router: Router<I, O>): Router<I, O> & Doc {
  return Object.assign((i: I) => router(i), { document: () => `${command}\t${description}` })
}

export function helpText(router: Router<any, any>): string {
  const raw = ('document' in router) ? (router as Doc).document() : ''
  const entries = raw.split('\n').filter(Boolean).map(line => {
    const t = line.indexOf('\t')
    return t >= 0 ? [line.slice(0, t), line.slice(t + 1)] as [string, string] : [line, ''] as [string, string]
  })
  const width = Math.max(0, ...entries.map(([c]) => c.length))
  return 'Usage: todos <command>\n\nCommands:\n' +
    entries.map(([c, d]) => `  ${c.padEnd(width)}  ${d}`).join('\n')
}

export const select = <I, O>(...routers: Router<I, O>[]): Router<I, O> & Doc => {
  const fn = async (i: I) => {
    for (const router of routers) {
      const result = await router(i)
      if (isOk(result)) {
        return result
      }
    }
    return routeNotFound('404')
  }
  return Object.assign(fn, {
    document: () => routers
      .filter((r): r is Router<I, O> & Doc => 'document' in r)
      .flatMap(r => (r as Doc).document().split('\n'))
      .filter(Boolean)
      .join('\n')
  })
}

export type Route<T> = { tokens: string[], params: Record<string, string>, value: T }
export const route = <T>(path: string, value: T): Route<T> => ({
  tokens: path.replace(/^\//, '').split('/').concat(EOP),
  params: {},
  value
})
export const next = <T>(r: Route<T>): Route<T> => ({
  ...r,
  tokens: r.tokens.slice(1),
})

export const match = <I, O>(token: string, child: Router<Route<I>, O>): Router<Route<I>, O> =>
async r => {
  if (r.tokens.length == 0) throw new Error('empty tokens')

  if (r.tokens[0] === token) {
    return child(next(r))
  }
  else {
    return routeNotFound('404')
  }
}

export const param = <I, O>(name: string, child: Router<Route<I>, O>): Router<Route<I>, O> & Doc => {
  const fn = (r: Route<I>) => {
    if (r.tokens.length == 0) throw new Error('empty tokens')
    return child({
      ...r,
      tokens: r.tokens.slice(1),
      params: {...r.params, [name]: r.tokens[0]!}
    })
  }
  return Object.assign(fn, {
    document: () => 'document' in child ? (child as Doc).document() : ''
  })
}

export const when = <I, O>(pred: (token: string) => boolean, name: string, child: Router<Route<I>, O>): Router<Route<I>, O> =>
r => {
  if (r.tokens[0] === EOP || !pred(r.tokens[0]!)) return routeNotFound('404')
  return child({
    ...r,
    tokens: r.tokens.slice(1),
    params: {...r.params, [name]: r.tokens[0]!}
  })
}

export const terminal = <I, O>(cb: (r: Route<I>) => PromiseOr<O>): Router<Route<I>, O> =>
async r => r.tokens[0] === EOP ? ok(await cb(r)) : routeNotFound('404')
