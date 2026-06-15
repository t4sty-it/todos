import { describe, test, expect } from 'bun:test'
import { select, match, param, when, terminal, route, rest, doc, helpText, ok, routeNotFound, EOP, type Route } from './router'

const eop = (): Route<string> => ({ tokens: [EOP], params: {}, value: '' })

describe('terminal', () => {
  test('matches when at EOP', async () => {
    const r = match('x', terminal(() => 'done'))
    expect(await r(route('x', ''))).toEqual(ok('done'))
  })

  test('rejects when tokens remain after match', async () => {
    const r = match('x', terminal(() => 'done'))
    expect((await r(route('x/extra', '')))._tag).toBe('RouteNotFound')
  })
})

describe('match', () => {
  test('matches a literal token and delegates', async () => {
    const r = match('all', terminal(() => 'hit'))
    expect(await r(route('all', ''))).toEqual(ok('hit'))
  })

  test('returns RouteNotFound for a different token', async () => {
    const r = match('all', terminal(() => 'hit'))
    expect((await r(route('other', '')))._tag).toBe('RouteNotFound')
  })
})

describe('param', () => {
  test('captures the next token by name', async () => {
    const r = param('id', terminal(r => r.params['id']))
    expect(await r(route('42', ''))).toEqual(ok('42'))
  })

  test('captures mid-path, leaving rest for child', async () => {
    const r = match('get', param('id', terminal(r => r.params['id'])))
    expect(await r(route('get/99', ''))).toEqual(ok('99'))
  })
})

describe('when', () => {
  const isTag = (t: string) => t.startsWith('#')

  test('captures when predicate passes', async () => {
    const r = when(isTag, 'tag', terminal(r => r.params['tag']))
    expect(await r(route('#foo', ''))).toEqual(ok('#foo'))
  })

  test('returns RouteNotFound when predicate fails', async () => {
    const r = when(isTag, 'tag', terminal(r => r.params['tag']))
    expect((await r(route('foo', '')))._tag).toBe('RouteNotFound')
  })

  test('returns RouteNotFound at EOP', async () => {
    const r = when(() => true, 'x', terminal(r => r.params['x']))
    expect((await r(eop()))._tag).toBe('RouteNotFound')
  })
})

describe('select', () => {
  test('returns the first matching router', async () => {
    const r = select(
      match('a', terminal(() => 'first')),
      match('b', terminal(() => 'second')),
    )
    expect(await r(route('a', ''))).toEqual(ok('first'))
    expect(await r(route('b', ''))).toEqual(ok('second'))
  })

  test('returns RouteNotFound when nothing matches', async () => {
    const r = select(match('a', terminal(() => 'x')))
    expect((await r(route('z', '')))._tag).toBe('RouteNotFound')
  })

  test('skips non-matching routers and finds the right one', async () => {
    const r = select(
      match('a', terminal(() => 'A')),
      match('b', terminal(() => 'B')),
      match('c', terminal(() => 'C')),
    )
    expect(await r(route('c', ''))).toEqual(ok('C'))
  })
})

describe('routeNotFound', () => {
  test('creates a RouteNotFound result with the given value', () => {
    const r = routeNotFound('my-value')
    expect(r._tag).toBe('RouteNotFound')
    expect(r.value).toBe('my-value')
  })
})

describe('route', () => {
  test('strips a leading slash before splitting tokens', async () => {
    const r = match('all', terminal(() => 'hit'))
    expect(await r(route('/all', ''))).toEqual(ok('hit'))
  })
})

describe('rest', () => {
  test('captures all remaining tokens as a space-joined string', async () => {
    const r = match('search', rest('query', terminal(r => r.params['query'])))
    expect(await r(route('search/hello/world', ''))).toEqual(ok('hello world'))
  })

  test('captures a single token without spaces', async () => {
    const r = match('search', rest('query', terminal(r => r.params['query'])))
    expect(await r(route('search/hello', ''))).toEqual(ok('hello'))
  })

  test('empty remaining path gives an empty string param', async () => {
    const r = match('search', rest('query', terminal(r => r.params['query'])))
    expect(await r(route('search', ''))).toEqual(ok(''))
  })
})

describe('doc and helpText', () => {
  test('doc wraps router behavior transparently', async () => {
    const r = doc('all', 'List all', match('all', terminal(() => 'hit')))
    expect(await r(route('all', ''))).toEqual(ok('hit'))
  })

  test('doc exposes a document() method', () => {
    const r = doc('all', 'List all', match('all', terminal(() => 'hit')))
    expect(r.document()).toBe('all\tList all')
  })

  test('helpText produces a Usage header', () => {
    const r = select(
      doc('all', 'List all todos', match('all', terminal(() => 'hit'))),
      doc('fields', 'List fields', match('fields', terminal(() => 'hit'))),
    )
    const text = helpText(r)
    expect(text).toContain('Usage: todos <command>')
    expect(text).toContain('all')
    expect(text).toContain('List all todos')
    expect(text).toContain('fields')
  })

  test('select aggregates document() from all doc-wrapped children', () => {
    const r = select(
      doc('foo', 'Foo cmd', match('foo', terminal(() => 'foo'))),
      doc('bar', 'Bar cmd', match('bar', terminal(() => 'bar'))),
      match('baz', terminal(() => 'baz')), // no doc
    )
    const combined = r.document()
    expect(combined).toContain('foo\tFoo cmd')
    expect(combined).toContain('bar\tBar cmd')
    expect(combined).not.toContain('baz')
  })
})

describe('composed routes', () => {
  test('match + param + terminal', async () => {
    const r = match('user', param('id', terminal(r => `user:${r.params['id']}`)))
    expect(await r(route('user/42', ''))).toEqual(ok('user:42'))
  })

  test('select with literal vs param fallback', async () => {
    const r = select(
      match('all', terminal(() => 'all')),
      param('id', terminal(r => `item:${r.params['id']}`)),
    )
    expect(await r(route('all', ''))).toEqual(ok('all'))
    expect(await r(route('123', ''))).toEqual(ok('item:123'))
  })

  test('nested select + when (tag routing pattern)', async () => {
    const isTag = (t: string) => t.startsWith('#')
    const isWord = (t: string) => !t.startsWith('#')
    const r = match('create', select(
      when(isWord, 'slug', when(isTag, 'tags', terminal(r => `${r.params['slug']}:${r.params['tags']}`))),
      when(isWord, 'slug', terminal(r => `${r.params['slug']}:none`)),
    ))
    expect(await r(route('create/my-task/#foo', ''))).toEqual(ok('my-task:#foo'))
    expect(await r(route('create/my-task', ''))).toEqual(ok('my-task:none'))
  })
})
