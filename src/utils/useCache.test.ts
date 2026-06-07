import { describe, test, expect } from 'bun:test'
import { useCache } from './useCache'

describe('useCache', () => {
  test('different caches are independent', () => {

    let c1Activations = 0
    const c1 = useCache(() => (c1Activations++, 1))

    let c2Activations = 0
    const c2 = useCache(() => (c2Activations++, 2))

    expect(c1()).toBe(1)
    expect(c2()).toBe(2)
    expect(c1Activations).toBe(1)
    expect(c2Activations).toBe(1)
  })

  test('builder gets called at most once', () => {
    let c1Activations = 0
    const c1 = useCache(() => (c1Activations++, 1))

    for (let i = 0; i < 10; i++) {
      c1()
    }

    expect(c1()).toBe(1)
    expect(c1Activations).toBe(1)
  })
})