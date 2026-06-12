import { describe, test, expect } from 'bun:test'
import { select, match, param, when, terminal, route, ok, EOP, type Route } from './router'

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
