import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadMetaCache, patchMetaCacheEntry, resetMetaCache } from './metaCache'

const TODO_1 = `---\nstatus: active\ntype: bug\ntags:\n  - FE\n---\n# Fix login\n\nBug description.\n`
const TODO_2 = `---\nstatus: new\ntype: feature\ntags:\n  - BE\n---\n# Add export\n`

let gitDir: string
let prevCwd: string

const git = async (...args: string[]) => {
  const proc = Bun.spawn(['git', ...args], { cwd: gitDir, stdout: 'pipe', stderr: 'pipe' })
  await proc.exited
}

const commit = async (message = 'test commit') => {
  await git('add', '.')
  await git('commit', '-m', message)
}

beforeEach(async () => {
  gitDir = join(tmpdir(), 'todos-metacache-test-' + Math.random().toString(36).slice(2))
  await mkdir(join(gitDir, 'todos'), { recursive: true })
  await git('init')
  await git('config', 'user.name', 'Test User')
  await git('config', 'user.email', 'test@test.com')
  resetMetaCache()
  prevCwd = process.cwd()
  process.chdir(gitDir)
})

afterEach(async () => {
  process.chdir(prevCwd)
  await rm(gitDir, { recursive: true, force: true })
})

describe('loadMetaCache', () => {
  test('returns entries for committed todo files with correct fields', async () => {
    await writeFile(join(gitDir, 'todos', '1-fix-login.md'), TODO_1)
    await writeFile(join(gitDir, 'todos', '2-add-export.md'), TODO_2)
    await commit('add todos')

    const map = await loadMetaCache()

    expect(map.size).toBe(2)

    const entry1 = map.get('todos/1-fix-login.md')!
    expect(entry1.id).toBe('1')
    expect(entry1.title).toBe('Fix login')
    expect(entry1.status).toBe('active')
    expect(entry1.type).toBe('bug')
    expect(entry1.tags).toEqual(['FE'])
    expect(entry1.createdAt).toBeInstanceOf(Date)
    expect(entry1.updatedAt).toBeInstanceOf(Date)
    expect(isNaN(entry1.createdAt.getTime())).toBe(false)
    expect(isNaN(entry1.updatedAt.getTime())).toBe(false)

    const entry2 = map.get('todos/2-add-export.md')!
    expect(entry2.id).toBe('2')
    expect(entry2.title).toBe('Add export')
    expect(entry2.status).toBe('new')
    expect(entry2.type).toBe('feature')
    expect(entry2.tags).toEqual(['BE'])
  })

  test('persists .todos/meta.json with correct schema', async () => {
    await writeFile(join(gitDir, 'todos', '1-fix-login.md'), TODO_1)
    await commit()

    await loadMetaCache()

    const raw = JSON.parse(await readFile(join(gitDir, '.todos', 'meta.json'), 'utf8'))
    const entry = raw['todos/1-fix-login.md']
    expect(entry).toBeDefined()
    expect(entry.schemaVersion).toBe(3)
    expect(typeof entry.blobSha).toBe('string')
    expect(entry.blobSha.length).toBeGreaterThan(0)
    expect(entry.id).toBe('1')
    expect(entry.title).toBe('Fix login')
    expect(isNaN(new Date(entry.createdAt).getTime())).toBe(false)
    expect(isNaN(new Date(entry.updatedAt).getTime())).toBe(false)
  })

  test('returns the same Promise on repeated calls (memoization)', async () => {
    await writeFile(join(gitDir, 'todos', '1-fix-login.md'), TODO_1)
    await commit()

    const p1 = loadMetaCache()
    const p2 = loadMetaCache()
    expect(p1).toBe(p2)
    await p1
  })

  test('rebuilds stale entry when blob SHA changes', async () => {
    await writeFile(join(gitDir, 'todos', '1-fix-login.md'), TODO_1)
    await commit('initial')

    const map1 = await loadMetaCache()
    expect(map1.get('todos/1-fix-login.md')!.title).toBe('Fix login')

    resetMetaCache()
    const updated = TODO_1.replace('# Fix login', '# Fixed login button')
    await writeFile(join(gitDir, 'todos', '1-fix-login.md'), updated)
    await commit('update title')

    const map2 = await loadMetaCache()
    expect(map2.get('todos/1-fix-login.md')!.title).toBe('Fixed login button')
    expect(map2.get('todos/1-fix-login.md')!.updatedAt.getTime()).toBeGreaterThan(
      map1.get('todos/1-fix-login.md')!.updatedAt.getTime() - 1
    )
  })

  test('rebuilds entry when stored schemaVersion does not match', async () => {
    await writeFile(join(gitDir, 'todos', '1-fix-login.md'), TODO_1)
    await commit()

    await loadMetaCache()

    resetMetaCache()
    const stale = JSON.parse(await readFile(join(gitDir, '.todos', 'meta.json'), 'utf8'))
    stale['todos/1-fix-login.md'].schemaVersion = 1
    await writeFile(join(gitDir, '.todos', 'meta.json'), JSON.stringify(stale, null, 2))

    await loadMetaCache()

    const rebuilt = JSON.parse(await readFile(join(gitDir, '.todos', 'meta.json'), 'utf8'))
    expect(rebuilt['todos/1-fix-login.md'].schemaVersion).toBe(3)
  })

  test('includes todos from subdirectories', async () => {
    await mkdir(join(gitDir, 'todos', 'sub'), { recursive: true })
    await writeFile(join(gitDir, 'todos', '1-fix-login.md'), TODO_1)
    await writeFile(join(gitDir, 'todos', 'sub', '2-sub-task.md'), TODO_2)
    await commit('add todos')

    const map = await loadMetaCache()

    expect(map.has('todos/1-fix-login.md')).toBe(true)
    expect(map.has('todos/sub/2-sub-task.md')).toBe(true)
    expect(map.get('todos/sub/2-sub-task.md')!.id).toBe('2')
    expect(map.get('todos/sub/2-sub-task.md')!.title).toBe('Add export')
  })

  test('excludes non-matching filenames from result', async () => {
    await writeFile(join(gitDir, 'todos', '1-fix-login.md'), TODO_1)
    await writeFile(join(gitDir, 'todos', 'README.md'), '# Not a todo')
    await writeFile(join(gitDir, 'todos', 'invalid.txt'), 'plain text')
    await commit()

    const map = await loadMetaCache()

    expect(map.has('todos/1-fix-login.md')).toBe(true)
    expect(map.has('todos/README.md')).toBe(false)
    expect(map.has('todos/invalid.txt')).toBe(false)
    expect(map.size).toBe(1)
  })

  test('excludes staged-but-not-committed file and warns', async () => {
    await writeFile(join(gitDir, 'todos', '1-fix-login.md'), TODO_1)
    await git('add', 'todos/1-fix-login.md')

    const spy = spyOn(process.stderr, 'write').mockImplementation(() => true)
    try {
      const map = await loadMetaCache()
      expect(map.has('todos/1-fix-login.md')).toBe(false)
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('1-fix-login.md'))
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('excluded from listings'))
    } finally {
      spy.mockRestore()
    }
  })

  test('excludes entry with invalid date in stored cache and warns', async () => {
    await writeFile(join(gitDir, 'todos', '1-fix-login.md'), TODO_1)
    await commit()

    await loadMetaCache()
    resetMetaCache()

    const stored = JSON.parse(await readFile(join(gitDir, '.todos', 'meta.json'), 'utf8'))
    stored['todos/1-fix-login.md'].createdAt = 'not-a-date'
    await writeFile(join(gitDir, '.todos', 'meta.json'), JSON.stringify(stored, null, 2))

    const spy = spyOn(process.stderr, 'write').mockImplementation(() => true)
    try {
      const map = await loadMetaCache()
      expect(map.has('todos/1-fix-login.md')).toBe(false)
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('invalid dates'))
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('1-fix-login.md'))
    } finally {
      spy.mockRestore()
    }
  })
})

describe('resetMetaCache', () => {
  test('causes the next loadMetaCache call to return a new Promise', async () => {
    await writeFile(join(gitDir, 'todos', '1-fix-login.md'), TODO_1)
    await commit()

    const p1 = loadMetaCache()
    await p1

    resetMetaCache()
    const p2 = loadMetaCache()

    expect(p1).not.toBe(p2)
    await p2
  })
})

describe('patchMetaCacheEntry', () => {
  test('updates the in-memory Map and persisted meta.json', async () => {
    await writeFile(join(gitDir, 'todos', '1-fix-login.md'), TODO_1)
    await commit()

    const map = await loadMetaCache()
    const originalCreatedAt = map.get('todos/1-fix-login.md')!.createdAt
    const originalUpdatedAt = map.get('todos/1-fix-login.md')!.updatedAt

    await patchMetaCacheEntry('todos/1-fix-login.md', { status: 'closed', tags: ['patched'] })

    expect(map.get('todos/1-fix-login.md')!.status).toBe('closed')
    expect(map.get('todos/1-fix-login.md')!.tags).toEqual(['patched'])
    expect(map.get('todos/1-fix-login.md')!.createdAt).toBe(originalCreatedAt)
    expect(map.get('todos/1-fix-login.md')!.updatedAt).toBe(originalUpdatedAt)

    const stored = JSON.parse(await readFile(join(gitDir, '.todos', 'meta.json'), 'utf8'))
    expect(stored['todos/1-fix-login.md'].status).toBe('closed')
    expect(stored['todos/1-fix-login.md'].tags).toEqual(['patched'])
  })

  test('does not crash when patching a non-existent entry', async () => {
    await expect(patchMetaCacheEntry('todos/99-ghost.md', { status: 'closed' })).resolves.toBeUndefined()
  })
})
