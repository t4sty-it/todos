import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'bun:test'
import { mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { useTodoStore } from './todoStore'

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
