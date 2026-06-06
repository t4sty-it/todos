import { describe, test, expect } from 'bun:test'
import { isResult, result } from './menu'

describe('result', () => {
  test('result is result', () => {
    expect(isResult(result(1))).toBeTrue()
  })
})