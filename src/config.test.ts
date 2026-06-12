import { describe, test, expect } from 'bun:test'
import { applyDisplay, applyView, emptyConfig, type Config } from './config'

// ANSI escape codes used by applyDisplay
const BOLD  = '\x1b[1m'
const RED   = '\x1b[31m'
const BLUE  = '\x1b[34m'
const RESET = '\x1b[0m'

describe('applyDisplay', () => {
  test('returns text unchanged with empty config', () => {
    expect(applyDisplay('hello', { type: 'bug' }, emptyConfig)).toBe('hello')
  })

  test('returns text unchanged when no field value matches', () => {
    const config: Config = { display: { type: { bug: 'red' } } }
    expect(applyDisplay('text', { type: 'task' }, config)).toBe('text')
  })

  test('returns text unchanged when field is absent', () => {
    const config: Config = { display: { type: { bug: 'red' } } }
    expect(applyDisplay('text', {}, config)).toBe('text')
  })

  test('wraps text with ANSI codes on a match', () => {
    const config: Config = { display: { type: { bug: 'bold' } } }
    const result = applyDisplay('text', { type: 'bug' }, config)
    expect(result).toBe(`${BOLD}text${RESET}`)
  })

  test('applies multiple tokens from one style string', () => {
    const config: Config = { display: { type: { bug: 'bold red' } } }
    const result = applyDisplay('text', { type: 'bug' }, config)
    expect(result).toContain(BOLD)
    expect(result).toContain(RED)
    expect(result).toContain('text')
    expect(result).toContain(RESET)
  })

  test('merges styles from multiple matching fields', () => {
    const config: Config = {
      display: {
        type:   { bug: 'red' },
        status: { active: 'bold' },
      }
    }
    const result = applyDisplay('text', { type: 'bug', status: 'active' }, config)
    expect(result).toContain(RED)
    expect(result).toContain(BOLD)
    expect(result).toContain('text')
  })

  test('handles array field values (tags)', () => {
    const config: Config = { display: { tags: { FE: 'blue' } } }
    const result = applyDisplay('text', { tags: ['FE', 'BE'] }, config)
    expect(result).toContain(BLUE)
  })

  test('does not duplicate ANSI codes when the same token appears in multiple fields', () => {
    const config: Config = {
      display: {
        type:   { bug: 'bold' },
        status: { active: 'bold' },
      }
    }
    const result = applyDisplay('text', { type: 'bug', status: 'active' }, config)
    // tokens are deduplicated into a Set, so BOLD should appear exactly once
    expect(result.split(BOLD).length - 1).toBe(1)
  })
})

describe('applyView', () => {
  const items = [
    { id: '1', status: 'active', type: 'bug' },
    { id: '2', status: 'new',    type: 'task' },
    { id: '3', status: 'active', type: 'task' },
    { id: '4', status: 'closed', type: 'bug' },
  ]

  test('empty view returns all items unchanged', () => {
    expect(applyView(items, {})).toHaveLength(4)
  })

  test('include filters to matching items', () => {
    const result = applyView(items, { include: [{ status: 'active' }] })
    expect(result).toHaveLength(2)
    expect(result.every(r => r['status'] === 'active')).toBe(true)
  })

  test('include ANDs multiple conditions', () => {
    const result = applyView(items, { include: [{ status: 'active' }, { type: 'bug' }] })
    expect(result).toHaveLength(1)
    expect(result[0]!['id']).toBe('1')
  })

  test('exclude removes any matching item', () => {
    const result = applyView(items, { exclude: [{ type: 'bug' }] })
    expect(result).toHaveLength(2)
    expect(result.every(r => r['type'] !== 'bug')).toBe(true)
  })

  test('exclude ORs multiple conditions', () => {
    const result = applyView(items, { exclude: [{ type: 'bug' }, { status: 'new' }] })
    expect(result).toHaveLength(1)
    expect(result[0]!['id']).toBe('3')
  })

  test('include and exclude together', () => {
    const result = applyView(items, {
      include: [{ status: 'active' }],
      exclude: [{ type: 'bug' }],
    })
    expect(result).toHaveLength(1)
    expect(result[0]!['id']).toBe('3')
  })

  test('sort ascending by string field (default)', () => {
    const result = applyView(items, { sort: ['type'] })
    expect(result[0]!['type']).toBe('bug')
    expect(result[result.length - 1]!['type']).toBe('task')
  })

  test('sort descending by string field', () => {
    // alphabetical desc: new > closed > active
    const result = applyView(items, { sort: ['status desc'] })
    expect(result[0]!['status']).toBe('new')
    expect(result[1]!['status']).toBe('closed')
  })

  test('sorts numeric ids numerically, not lexicographically', () => {
    const numItems = [
      { id: '10' }, { id: '2' }, { id: '1' },
    ]
    const result = applyView(numItems, { sort: ['id asc'] })
    expect(result.map(r => r['id'])).toEqual(['1', '2', '10'])
  })

  test('multi-key sort', () => {
    const result = applyView(items, { sort: ['type asc', 'id desc'] })
    const ids = result.map(r => r['id'])
    // bugs (type=bug) come first, sorted by id desc: 4, 1
    expect(ids.indexOf('4')).toBeLessThan(ids.indexOf('1'))
    // tasks come after bugs, sorted by id desc: 3, 2
    expect(ids.indexOf('3')).toBeLessThan(ids.indexOf('2'))
    expect(ids.indexOf('1')).toBeLessThan(ids.indexOf('3'))
  })

  test('include with array field matches items containing the value', () => {
    const tagItems = [
      { id: '1', tags: ['FE', 'BE'] },
      { id: '2', tags: ['BE'] },
    ]
    const result = applyView(tagItems, { include: [{ tags: 'FE' }] })
    expect(result).toHaveLength(1)
    expect(result[0]!['id']).toBe('1')
  })

  test('does not mutate the input array', () => {
    const input = [{ id: '2' }, { id: '1' }]
    applyView(input, { sort: ['id asc'] })
    expect(input[0]!['id']).toBe('2')
  })
})
