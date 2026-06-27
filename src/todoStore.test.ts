import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach, spyOn } from 'bun:test'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { useTodoStore } from './todoStore'
import { resetMetaCache } from './metaCache'

const TODO_1 = `---\nstatus: active\ntype: bug\ntags:\n  - FE\n---\n# Fix login\n\nBug description.\n`
const TODO_2 = `---\nstatus: new\ntype: feature\ntags:\n  - BE\n  - untagged\n---\n# Add export\n`
const TODO_3 = `---\nstatus: active\ntype: feature\n---\n# Dark mode\n`

let tmpDir: string
let originalCwd: string

const reset = async () => {
  await rm(join(tmpDir, 'todos'), { recursive: true, force: true })
  await mkdir(join(tmpDir, 'todos'), { recursive: true })
  await writeFile(join(tmpDir, 'todos', '1-fix-login.md'), TODO_1)
  await writeFile(join(tmpDir, 'todos', '2-add-export.md'), TODO_2)
  await writeFile(join(tmpDir, 'todos', '3-dark-mode.md'), TODO_3)
}

beforeAll(async () => {
  originalCwd = process.cwd()
  tmpDir = join(tmpdir(), 'todos-store-test-' + Math.random().toString(36).slice(2))
  await mkdir(tmpDir, { recursive: true })
  await reset()
  process.chdir(tmpDir)
})

afterAll(async () => {
  process.chdir(originalCwd)
  await rm(tmpDir, { recursive: true, force: true })
})

beforeEach(reset)

describe('all', () => {
  test('returns all todos from the folder', async () => {
    const todos = await useTodoStore().all()
    expect(todos).toHaveLength(3)
    expect(todos.map(t => t.id).sort()).toEqual(['1', '2', '3'])
  })

  test('ignores non-conforming filenames with a warning', async () => {
    await writeFile(join(tmpDir, 'todos', 'README.md'), '# not a todo')
    const spy = spyOn(process.stderr, 'write').mockImplementation(() => true)
    try {
      resetMetaCache()
      const todos = await useTodoStore().all()
      expect(todos.map(t => t.id).sort()).toEqual(['1', '2', '3'])
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('README.md'))
    } finally {
      spy.mockRestore()
    }
  })

  test('returns todos from subdirectories', async () => {
    await mkdir(join(tmpDir, 'todos', 'sub'), { recursive: true })
    await writeFile(join(tmpDir, 'todos', 'sub', '10-sub-task.md'), TODO_1)
    resetMetaCache()
    const todos = await useTodoStore().all()
    expect(todos.some(t => t.id === '10')).toBe(true)
    expect(todos.some(t => t.url === 'todos/sub/10-sub-task.md')).toBe(true)
  })

  test('ignores all files sharing a duplicate id with a warning', async () => {
    await writeFile(join(tmpDir, 'todos', '1-duplicate.md'), TODO_1)
    const spy = spyOn(process.stderr, 'write').mockImplementation(() => true)
    try {
      resetMetaCache()
      const todos = await useTodoStore().all()
      expect(todos.map(t => t.id)).not.toContain('1')
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('duplicate id 1'))
    } finally {
      spy.mockRestore()
    }
  })
})

describe('get', () => {
  test('returns the todo by id with all fields', async () => {
    const todo = await useTodoStore().get('1')
    expect(todo.id).toBe('1')
    expect(todo.title).toBe('Fix login')
    expect(todo.status).toBe('active')
    expect(todo.type).toBe('bug')
    expect(todo.tags).toEqual(['FE'])
    expect(todo.description).toContain('Bug description')
  })

  test('throws for an unknown id', async () => {
    await expect(useTodoStore().get('99')).rejects.toThrow('Todo not found: 99')
  })
})

describe('fields', () => {
  test('returns fields that have at least one value across all todos', async () => {
    const fields = await useTodoStore().fields()
    expect(fields).toContain('status')
    expect(fields).toContain('type')
    expect(fields).toContain('tags')
  })
})

describe('fieldValues', () => {
  test('returns deduplicated values for a string field', async () => {
    const values = await useTodoStore().fieldValues('status')
    expect(values).toContain('active')
    expect(values).toContain('new')
    expect(values.filter(v => v === 'active')).toHaveLength(1)
  })

  test('returns individual values from array fields (tags)', async () => {
    const values = await useTodoStore().fieldValues('tags')
    expect(values).toContain('FE')
    expect(values).toContain('BE')
    expect(values).toContain('untagged')
  })
})

describe('filterBy', () => {
  test('filters by exact string field value', async () => {
    const todos = await useTodoStore().filterBy('status', 'active')
    expect(todos).toHaveLength(2)
    expect(todos.every(t => t.status === 'active')).toBe(true)
  })

  test('filters by tag in array field', async () => {
    const todos = await useTodoStore().filterBy('tags', 'FE')
    expect(todos).toHaveLength(1)
    expect(todos[0]!.id).toBe('1')
  })

  test('empty string matches todos where field is absent or empty', async () => {
    // todo 3 has no tags field
    const todos = await useTodoStore().filterBy('tags', '')
    expect(todos.some(t => t.id === '3')).toBe(true)
  })
})

describe('create', () => {
  test('creates a todo with default type and untagged sentinel', async () => {
    const store = useTodoStore()
    const todo = await store.create('my-new-task')
    expect(todo.title).toBe('my new task')
    expect(todo.type).toBe('task')
    expect(todo.tags).toEqual(['untagged'])
    expect(todo.status).toBe('new')
    const all = await store.all()
    expect(all).toHaveLength(4)
  })

  test('creates a todo with custom type and tags', async () => {
    const todo = await useTodoStore().create('the-fix', 'bug', ['FE', 'urgent'])
    expect(todo.type).toBe('bug')
    expect(todo.tags).toEqual(['FE', 'urgent'])
  })

  test('assigns the next available numeric id', async () => {
    const store = useTodoStore()
    const todo = await store.create('first')
    expect(Number(todo.id)).toBeGreaterThan(3)
  })
})

describe('tag', () => {
  test('adds a tag to a todo', async () => {
    const todo = await useTodoStore().tag('1', 'add', 'important')
    expect(todo.tags).toContain('important')
    expect(todo.tags).toContain('FE') // existing tag preserved
  })

  test('add is idempotent', async () => {
    const store = useTodoStore()
    await store.tag('1', 'add', 'dup')
    const todo = await store.tag('1', 'add', 'dup')
    expect(todo.tags!.filter(t => t === 'dup')).toHaveLength(1)
  })

  test('adding a tag removes the untagged sentinel', async () => {
    // todo 2 has 'untagged' in its tags
    const todo = await useTodoStore().tag('2', 'add', 'newtag')
    expect(todo.tags).not.toContain('untagged')
    expect(todo.tags).toContain('newtag')
  })

  test('removes a tag from a todo', async () => {
    const store = useTodoStore()
    await store.tag('1', 'add', 'to-remove')
    const todo = await store.tag('1', 'remove', 'to-remove')
    expect(todo.tags).not.toContain('to-remove')
  })

  test('throws for an unknown id', async () => {
    await expect(useTodoStore().tag('99', 'add', 'x')).rejects.toThrow('Todo not found: 99')
  })
})

describe('set', () => {
  test('sets a writable string field and persists it', async () => {
    const store = useTodoStore()
    await store.set('3', 'status', 'closed')
    store.reload()
    const todo = await store.get('3')
    expect(todo.status).toBe('closed')
  })

  test('throws when trying to set id (read-only)', async () => {
    await expect(useTodoStore().set('1', 'id', '999')).rejects.toThrow('read-only')
  })

  test('throws when trying to set url (read-only)', async () => {
    await expect(useTodoStore().set('1', 'url', 'bad.md')).rejects.toThrow('read-only')
  })

  test('throws for an unknown id', async () => {
    await expect(useTodoStore().set('99', 'status', 'done')).rejects.toThrow('Todo not found: 99')
  })
})

describe('view', () => {
  test('applies include/exclude/sort from a view config', async () => {
    const todos = await useTodoStore().view({
      include: [{ status: 'active' }],
      exclude: [{ type: 'bug' }],
      sort: ['id asc'],
    })
    expect(todos).toHaveLength(1)
    expect(todos[0]!.id).toBe('3')
  })
})

describe('search', () => {
  test('returns todos whose title matches exactly (case-insensitive)', async () => {
    const results = await useTodoStore().search('Fix login')
    expect(results.some(t => t.id === '1')).toBe(true)
  })

  test('returns todos whose description matches', async () => {
    const results = await useTodoStore().search('Bug description')
    expect(results.some(t => t.id === '1')).toBe(true)
  })

  test('fuzzy match returns a todo not in the exact results', async () => {
    // 'fxlgn' fuzzy-matches 'Fix login' but is not a substring
    const results = await useTodoStore().search('fxlgn')
    expect(results.some(t => t.id === '1')).toBe(true)
  })

  test('exact matches are not duplicated in the fuzzy section', async () => {
    // 'Fix' is an exact substring; todo 1 should appear exactly once
    const results = await useTodoStore().search('Fix')
    const matchingId1 = results.filter(t => t.id === '1')
    expect(matchingId1).toHaveLength(1)
  })

  test('special regex chars in query are escaped', async () => {
    // 'fix.login' with a literal dot should NOT match 'fix login' (space ≠ dot)
    const results = await useTodoStore().search('fix.login')
    expect(results.some(t => t.id === '1')).toBe(false)
  })

  test('multi-word query matches as an exact phrase', async () => {
    const results = await useTodoStore().search('Bug desc')
    expect(results.some(t => t.id === '1')).toBe(true)
  })
})

describe('reload', () => {
  test('picks up a file written externally after the cache was populated', async () => {
    const store = useTodoStore()
    await store.all() // populate cache
    await writeFile(join(tmpDir, 'todos', '9-external.md'),
      `---\nstatus: new\ntype: task\n---\n# External\n`)
    store.reload()
    const all = await store.all()
    expect(all.some(t => t.id === '9')).toBe(true)
  })
})

describe('multi-path support', () => {
  let multiDir: string
  let prevCwd: string

  beforeEach(async () => {
    multiDir = join(tmpdir(), 'todos-multi-test-' + Math.random().toString(36).slice(2))
    await mkdir(join(multiDir, 'todos'), { recursive: true })
    await mkdir(join(multiDir, 'work-todos'), { recursive: true })
    await writeFile(join(multiDir, 'todos', '1-personal.md'), TODO_1)
    await writeFile(join(multiDir, 'work-todos', '2-work-task.md'), TODO_2)
    await writeFile(
      join(multiDir, 'todosConfig.json'),
      JSON.stringify({ paths: ['todos', 'work-todos'] })
    )
    resetMetaCache()
    prevCwd = process.cwd()
    process.chdir(multiDir)
  })

  afterEach(async () => {
    process.chdir(prevCwd)
    await rm(multiDir, { recursive: true, force: true })
  })

  test('aggregates todos from all configured paths', async () => {
    const store = useTodoStore()
    const all = await store.all()
    expect(all).toHaveLength(2)
    expect(all.some(t => t.id === '1')).toBe(true)
    expect(all.some(t => t.id === '2')).toBe(true)
  })

  test('todo.url includes the source path prefix', async () => {
    const store = useTodoStore()
    const all = await store.all()
    expect(all.some(t => t.url === 'todos/1-personal.md')).toBe(true)
    expect(all.some(t => t.url === 'work-todos/2-work-task.md')).toBe(true)
  })

  test('get() retrieves todo from any configured path', async () => {
    const store = useTodoStore()
    const todo = await store.get('2')
    expect(todo.title).toBe('Add export')
    expect(todo.url).toBe('work-todos/2-work-task.md')
  })

  test('create() writes to the first configured path', async () => {
    const store = useTodoStore()
    const todo = await store.create('new-task')
    expect(todo.url.startsWith('todos/')).toBe(true)
    const all = await store.all()
    expect(all.some(t => t.id === todo.id)).toBe(true)
  })

  test('defaults to todos/ when paths is absent', async () => {
    await writeFile(join(multiDir, 'todosConfig.json'), JSON.stringify({}))
    resetMetaCache()
    const store = useTodoStore()
    const all = await store.all()
    expect(all).toHaveLength(1)
    expect(all[0]!.url).toBe('todos/1-personal.md')
  })
})

describe('mutation survives reload with git-backed meta cache', () => {
  let gitDir: string
  let prevCwd: string

  const git = async (...args: string[]) => {
    const proc = Bun.spawn(['git', ...args], { cwd: gitDir, stdout: 'pipe', stderr: 'pipe' })
    await proc.exited
  }

  beforeAll(async () => {
    // Set up git repo but DON'T chdir here — Bun runs all beforeAll hooks before
    // any tests, so changing cwd here would break earlier tests in this file.
    gitDir = join(tmpdir(), 'todos-git-test-' + Math.random().toString(36).slice(2))
    await mkdir(join(gitDir, 'todos'), { recursive: true })
    await writeFile(join(gitDir, 'todos', '1-fix-login.md'), TODO_1)
    await writeFile(join(gitDir, 'todos', '2-add-export.md'), TODO_2)
    await writeFile(join(gitDir, 'todos', '3-dark-mode.md'), TODO_3)
    await git('init')
    await git('config', 'user.name', 'Test User')
    await git('config', 'user.email', 'test@test.com')
    await git('add', 'todos/')
    await git('commit', '-m', 'initial')
  })

  afterAll(async () => {
    await rm(gitDir, { recursive: true, force: true })
  })

  beforeEach(async () => {
    await rm(join(gitDir, 'todos'), { recursive: true, force: true })
    await mkdir(join(gitDir, 'todos'), { recursive: true })
    await writeFile(join(gitDir, 'todos', '1-fix-login.md'), TODO_1)
    await writeFile(join(gitDir, 'todos', '2-add-export.md'), TODO_2)
    await writeFile(join(gitDir, 'todos', '3-dark-mode.md'), TODO_3)
    await rm(join(gitDir, '.todos'), { recursive: true, force: true })
    resetMetaCache()
    prevCwd = process.cwd()
    process.chdir(gitDir)
  })

  afterEach(async () => {
    process.chdir(prevCwd)
  })

  test('set() change is visible in all() listing after reload', async () => {
    const store = useTodoStore()
    await store.all() // warms meta cache; reads git SHAs and writes .todos/meta.json
    await store.set('3', 'status', 'closed')
    store.reload()
    const all = await store.all()
    const todo3 = all.find(t => t.id === '3')
    expect(todo3!.status).toBe('closed')
  })

  test('tag() change is visible in all() listing after reload', async () => {
    const store = useTodoStore()
    await store.all()
    await store.tag('1', 'add', 'backend')
    store.reload()
    const all = await store.all()
    const todo1 = all.find(t => t.id === '1')
    expect(todo1!.tags).toContain('backend')
  })

  test('set() type change is visible in all() listing after reload', async () => {
    const store = useTodoStore()
    await store.all()
    await store.set('1', 'type', 'chore')
    store.reload()
    const all = await store.all()
    const todo1 = all.find(t => t.id === '1')
    expect(todo1!.type).toBe('chore')
  })
})
