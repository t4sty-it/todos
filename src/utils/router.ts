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


export const select: <I, O>(...routers: Router<I,O>[]) => Router<I, O> =
(...routers) => async i => {
  for (const router of routers) {
    const result = await router(i)
    if (isOk(result)) {
      return result
    }
  }

  return routeNotFound('404')
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

export const param = <I, O>(name: string, child: Router<Route<I>, O>): Router<Route<I>, O> =>
r => {
  if (r.tokens.length == 0) throw new Error('empty tokens')

  return child({
    ...r,
    tokens: r.tokens.slice(1),
    params: {...r.params, [name]: r.tokens[0]!}
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
