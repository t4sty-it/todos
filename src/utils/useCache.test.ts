import { describe, test, expect } from 'bun:test'
import { useCache } from './useCache'

describe('useCache', () => {
  test('different caches are independent', async () => {
    let c1Activations = 0
    const c1 = useCache(async () => (c1Activations++, 1))

    let c2Activations = 0
    const c2 = useCache(async () => (c2Activations++, 2))

    expect(await c1()).toBe(1)
    expect(await c2()).toBe(2)
    expect(c1Activations).toBe(1)
    expect(c2Activations).toBe(1)
  })

  test('builder gets called at most once', async () => {
    let activations = 0
    const c = useCache(async () => (activations++, 1))

    for (let i = 0; i < 10; i++) {
      await c()
    }

    expect(await c()).toBe(1)
    expect(activations).toBe(1)
  })

  test('concurrent calls before resolution share the same promise', async () => {
    let activations = 0
    const c = useCache(async () => {
      activations++
      await new Promise(r => setTimeout(r, 10))
      return 42
    })

    const [r1, r2, r3] = await Promise.all([c(), c(), c()])
    expect(r1).toBe(42)
    expect(r2).toBe(42)
    expect(r3).toBe(42)
    expect(activations).toBe(1)
  })
})
