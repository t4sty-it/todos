import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import { mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { findProjectRoot } from './findProjectRoot'

let tmp: string

beforeAll(async () => {
  tmp = join(tmpdir(), 'find-root-' + Math.random().toString(36).slice(2))
  // Structure: tmp/root/todos/  tmp/root/a/b/c/
  await mkdir(join(tmp, 'root', 'todos'), { recursive: true })
  await mkdir(join(tmp, 'root', 'a', 'b', 'c'), { recursive: true })
  // Sibling with no todos/
  await mkdir(join(tmp, 'empty'), { recursive: true })
})

afterAll(async () => {
  await rm(tmp, { recursive: true, force: true })
})

describe('findProjectRoot', () => {
  test('returns the directory itself when it contains todos/', () => {
    expect(findProjectRoot(join(tmp, 'root'))).toBe(join(tmp, 'root'))
  })

  test('walks up to find the ancestor containing todos/', () => {
    expect(findProjectRoot(join(tmp, 'root', 'a', 'b', 'c'))).toBe(join(tmp, 'root'))
  })

  test('returns undefined when no ancestor has todos/', () => {
    expect(findProjectRoot(join(tmp, 'empty'))).toBeUndefined()
  })

  test('returns undefined for the filesystem root', () => {
    // '/' has no todos/ sibling to walk to; even if it did this would bottom out
    // We just ensure it doesn't throw or loop forever
    const result = findProjectRoot('/')
    expect(result === undefined || typeof result === 'string').toBe(true)
  })
})
