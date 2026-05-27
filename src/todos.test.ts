import { describe, test, expect } from 'bun:test'
import { parse } from './todos'

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
    const result = parse(text, '1')
    expect(result.id).toBe('1')
    expect(result.title).toBe('Title')
    expect(result.description).toBe('## Chapter 1\n')
    expect(result.type).toBe('bug')
    expect(result.status).toBe('active')
    expect(result.tags).toBeArray()
    expect(result.tags!.at(0)).toBe('FE')
    expect(result.tags!.at(1)).toBe('BE')
  })

})