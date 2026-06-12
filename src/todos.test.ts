import { describe, test, expect } from 'bun:test'
import { parse, stringify, patch } from './todos'

describe('todos parsing', () => {

  const text = `
---
type: bug
status: active
tags: FE, BE
---
# Title
## Chapter 1
`

  test('happy path', () => {
    const result = parse(text, '1-test.md')
    expect(result.id).toBe('1')
    expect(result.title).toBe('Title')
    expect(result.description).toBe('## Chapter 1\n')
    expect(result.type).toBe('bug')
    expect(result.status).toBe('active')
    expect(result.tags).toBeArray()
    expect(result.tags!.at(0)).toBe('FE')
    expect(result.tags!.at(1)).toBe('BE')
  })

  test('tags as YAML array', () => {
    const t = `---\ntags:\n  - foo\n  - bar\n---\n# T\n`
    const result = parse(t, '2-x.md')
    expect(result.tags).toEqual(['foo', 'bar'])
  })

  test('no title yields empty string', () => {
    const t = `---\nstatus: new\n---\nsome body\n`
    const result = parse(t, '3-x.md')
    expect(result.title).toBe('')
  })

  test('empty frontmatter yields no fields', () => {
    const t = `---\n---\n# T\n`
    const result = parse(t, '4-x.md')
    expect(result.status).toBeUndefined()
    expect(result.type).toBeUndefined()
    expect(result.tags).toBeUndefined()
  })

  test('no frontmatter', () => {
    const t = `# Title\nsome body`
    const result = parse(t, '5-x.md')
    expect(result.title).toBe('Title')
    expect(result.status).toBeUndefined()
  })

})

describe('stringify', () => {

  test('round-trip parse→stringify preserves fields', () => {
    const text = `---\nstatus: active\ntype: task\ntags:\n  - foo\n---\n# My title\nsome body\n`
    const todo = parse(text, '1-my-title.md')
    const out = stringify(todo)
    const reparsed = parse(out, '1-my-title.md')
    expect(reparsed.title).toBe(todo.title)
    expect(reparsed.status).toBe(todo.status)
    expect(reparsed.type).toBe(todo.type)
    expect(reparsed.tags).toEqual(todo.tags)
  })

})

describe('patch', () => {

  test('patches a string field', () => {
    const text = `---\nstatus: new\ntype: task\n---\n# T\n`
    const result = parse(patch(text, 'status', 'done'), '1-t.md')
    expect(result.status).toBe('done')
  })

  test('patches tags (array)', () => {
    const text = `---\nstatus: new\ntags:\n  - untagged\n---\n# T\n`
    const result = parse(patch(text, 'tags', ['foo', 'bar']), '1-t.md')
    expect(result.tags).toEqual(['foo', 'bar'])
  })

  test('throws on missing frontmatter', () => {
    expect(() => patch('# No frontmatter', 'status', 'done')).toThrow('No front matter')
  })

})
