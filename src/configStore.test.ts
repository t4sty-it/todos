import { describe, test, expect, beforeAll, afterAll, beforeEach, spyOn } from 'bun:test'
import { mkdir, writeFile, rm, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { useConfigStore } from './configStore'

let tmpDir: string
let originalCwd: string

beforeAll(async () => {
  originalCwd = process.cwd()
  tmpDir = join(tmpdir(), 'todos-config-test-' + Math.random().toString(36).slice(2))
  await mkdir(tmpDir, { recursive: true })
  process.chdir(tmpDir)
})

afterAll(async () => {
  process.chdir(originalCwd)
  await rm(tmpDir, { recursive: true, force: true })
})

beforeEach(async () => {
  // ensure no config file between tests
  await unlink(join(tmpDir, 'todosConfig.json')).catch(() => {})
})

describe('useConfigStore', () => {
  test('returns empty config when file is absent', async () => {
    const config = await useConfigStore().get()
    expect(config.display).toBeUndefined()
    expect(config.views).toBeUndefined()
    expect(config.editor).toBeUndefined()
  })

  test('returns parsed config from valid JSON', async () => {
    await writeFile(join(tmpDir, 'todosConfig.json'), JSON.stringify({
      editor: 'nvim',
      display: { type: { bug: 'red bold' } },
      views: { active: { include: [{ status: 'active' }] } },
    }))
    const config = await useConfigStore().get()
    expect(config.editor).toBe('nvim')
    expect(config.display?.['type']?.['bug']).toBe('red bold')
    expect(config.views?.['active']).toBeDefined()
  })

  test('returns empty config and warns on malformed JSON', async () => {
    await writeFile(join(tmpDir, 'todosConfig.json'), '{ not valid json }')
    const spy = spyOn(process.stderr, 'write').mockImplementation(() => true)
    try {
      const config = await useConfigStore().get()
      expect(config.display).toBeUndefined()
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('Warning'))
    } finally {
      spy.mockRestore()
    }
  })

  test('each call to useConfigStore creates an independent memoized cache', async () => {
    await writeFile(join(tmpDir, 'todosConfig.json'), JSON.stringify({ editor: 'vim' }))
    const store1 = useConfigStore()
    const c1 = await store1.get() // triggers memoization with 'vim'

    await writeFile(join(tmpDir, 'todosConfig.json'), JSON.stringify({ editor: 'nano' }))
    const store2 = useConfigStore()
    const c2 = await store2.get() // fresh store reads the updated file

    expect(c1.editor).toBe('vim')
    expect(c2.editor).toBe('nano')
    // store1's cache is independent — still returns the memoized 'vim'
    expect((await store1.get()).editor).toBe('vim')
  })
})
