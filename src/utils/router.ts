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

export interface Completable {
  complete(tokens: string[], params: Record<string, string>): Promise<string[]>
}

function isCompletable(r: unknown): r is Completable {
  return r != null && typeof (r as any).complete === 'function'
}

export type CompletionFn = (params: Record<string, string>) => PromiseOr<string[]>

export async function completionCandidates(router: Router<any, any>, tokens: string[]): Promise<string[]> {
  return isCompletable(router) ? router.complete(tokens, {}) : []
}

export function doc<I, O>(command: string, description: string, router: Router<I, O>): Router<I, O> & Doc & Completable {
  const base = {
    document: () => `${command}\t${description}`,
    complete: (tokens: string[], params: Record<string, string>) =>
      isCompletable(router) ? router.complete(tokens, params) : Promise.resolve([]),
  }
  // Propagate _literalToken so select can distinguish literal matches from wildcards
  if ('_literalToken' in router) Object.assign(base, { _literalToken: (router as any)._literalToken })
  return Object.assign((i: I) => router(i), base)
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

export const select = <I, O>(...routers: Router<I, O>[]): Router<I, O> & Doc & Completable => {
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
      .join('\n'),
    complete: async (tokens: string[], params: Record<string, string>): Promise<string[]> => {
      const completable = routers.filter(isCompletable) as unknown as Completable[]
      if (tokens.length === 0) {
        const results = await Promise.all(completable.map(r => r.complete(tokens, params)))
        return [...new Set(results.flat() as string[])]
      }
      // When consuming a token, prefer literal match(token, ...) nodes over wildcards.
      // This mirrors routing priority and prevents catch-all params from swallowing literal commands.
      const literals = routers.filter(r => '_literalToken' in r && (r as any)._literalToken === tokens[0]) as unknown as Completable[]
      const targeted = literals.length > 0
        ? literals
        : completable.filter(r => !('_literalToken' in (r as any)))
      const results = await Promise.all(targeted.map(r => r.complete(tokens, params)))
      return [...new Set(results.flat() as string[])]
    },
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

export const match = <I, O>(token: string, child: Router<Route<I>, O>): Router<Route<I>, O> & Completable & { _literalToken: string } => {
  const fn = async (r: Route<I>) => {
    if (r.tokens.length == 0) throw new Error('empty tokens')
    return r.tokens[0] === token ? child(next(r)) : routeNotFound('404')
  }
  return Object.assign(fn, {
    _literalToken: token,
    complete: async (tokens: string[], params: Record<string, string>): Promise<string[]> => {
      if (tokens.length === 0) return [token]
      if (tokens[0] === token) return isCompletable(child) ? child.complete(tokens.slice(1), params) : []
      return []
    },
  })
}

export const param = <I, O>(name: string, child: Router<Route<I>, O>): Router<Route<I>, O> & Doc & Completable => {
  const fn = (r: Route<I>) => {
    if (r.tokens.length == 0) throw new Error('empty tokens')
    return child({
      ...r,
      tokens: r.tokens.slice(1),
      params: {...r.params, [name]: r.tokens[0]!}
    })
  }
  return Object.assign(fn, {
    document: () => 'document' in child ? (child as Doc).document() : '',
    complete: async (tokens: string[], params: Record<string, string>): Promise<string[]> => {
      if (tokens.length === 0) return []
      const next = { ...params, [name]: tokens[0]! }
      return isCompletable(child) ? child.complete(tokens.slice(1), next) : []
    },
  })
}

// Like param, but carries a completion function that provides candidates when no token is consumed yet.
export const completing = <I, O>(
  fn: CompletionFn,
  name: string,
  child: Router<Route<I>, O>
): Router<Route<I>, O> & Doc & Completable => {
  const inner = param(name, child)
  return Object.assign((r: Route<I>) => inner(r), {
    document: () => inner.document(),
    complete: async (tokens: string[], params: Record<string, string>): Promise<string[]> => {
      if (tokens.length === 0) {
        const result = fn(params)
        return Array.isArray(result) ? result : await result
      }
      const next = { ...params, [name]: tokens[0]! }
      return isCompletable(child) ? child.complete(tokens.slice(1), next) : []
    },
  })
}

export const when = <I, O>(pred: (token: string) => boolean, name: string, child: Router<Route<I>, O>): Router<Route<I>, O> & Completable => {
  const fn = (r: Route<I>) => {
    if (r.tokens[0] === EOP || !pred(r.tokens[0]!)) return routeNotFound('404')
    return child({
      ...r,
      tokens: r.tokens.slice(1),
      params: {...r.params, [name]: r.tokens[0]!}
    })
  }
  return Object.assign(fn, {
    complete: async (tokens: string[], params: Record<string, string>): Promise<string[]> => {
      if (tokens.length === 0 || !pred(tokens[0]!)) return []
      const next = { ...params, [name]: tokens[0]! }
      return isCompletable(child) ? child.complete(tokens.slice(1), next) : []
    },
  })
}

export const terminal = <I, O>(cb: (r: Route<I>) => PromiseOr<O>): Router<Route<I>, O> & Completable =>
  Object.assign(
    async (r: Route<I>) => r.tokens[0] === EOP ? ok(await cb(r)) : routeNotFound('404'),
    { complete: async (): Promise<string[]> => [] }
  )

export const rest = <I, O>(name: string, child: Router<Route<I>, O>): Router<Route<I>, O> & Doc & Completable => {
  const fn = (r: Route<I>) => {
    const eop = r.tokens.indexOf(EOP)
    const remaining = r.tokens.slice(0, eop < 0 ? r.tokens.length : eop)
    return child({
      ...r,
      tokens: [EOP],
      params: {...r.params, [name]: remaining.join(' ')}
    })
  }
  return Object.assign(fn, {
    document: () => 'document' in child ? (child as Doc).document() : '',
    complete: async (): Promise<string[]> => [],
  })
}
