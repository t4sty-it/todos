import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'bun:test'
import { mkdir, writeFile, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

// Absolute path to the CLI entry point
const CLI = resolve(import.meta.dir, 'index.ts')

const TODO_1 = `---\nstatus: active\ntype: bug\ntags:\n  - FE\n---\n# Fix login\n\nBug description.\n`
const TODO_2 = `---\nstatus: new\ntype: feature\ntags:\n  - BE\n---\n# Add export\n`
const TODO_3 = `---\nstatus: active\ntype: feature\ntags:\n  - untagged\n---\n# Dark mode\n`

const CONFIG = JSON.stringify({
  views: {
    bugs:   { include: [{ type: 'bug' }],            sort: ['id asc'] },
    active: { include: [{ status: 'active' }],       sort: ['id asc'] },
  }
})

let tmpDir: string

const run = async (...args: string[]) => {
  const proc = Bun.spawn([process.execPath, 'run', CLI, ...args], {
    cwd: tmpDir,
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  return { out: stdout.trim(), err: stderr.trim(), exitCode }
}

// Strip ANSI escape codes for readable assertions
const strip = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '')

const reset = async () => {
  await rm(join(tmpDir, 'todos'), { recursive: true, force: true })
  await rm(join(tmpDir, '.todos'), { recursive: true, force: true })
  await mkdir(join(tmpDir, 'todos'), { recursive: true })
  await writeFile(join(tmpDir, 'todos', '1-fix-login.md'), TODO_1)
  await writeFile(join(tmpDir, 'todos', '2-add-export.md'), TODO_2)
  await writeFile(join(tmpDir, 'todos', '3-dark-mode.md'), TODO_3)
  await writeFile(join(tmpDir, 'todosConfig.json'), CONFIG)
}

beforeAll(async () => {
  tmpDir = join(tmpdir(), 'todos-e2e-' + Math.random().toString(36).slice(2))
  await mkdir(tmpDir, { recursive: true })
  await reset()
})

afterAll(async () => {
  await rm(tmpDir, { recursive: true, force: true })
})

beforeEach(reset)

describe('all', () => {
  test('lists all todos in fixed-width table format', async () => {
    const { out, exitCode } = await run('all')
    const clean = strip(out)
    expect(exitCode).toBe(0)
    expect(clean).toContain('#1')
    expect(clean).toContain('Fix login')
    expect(clean).toContain('#2')
    expect(clean).toContain('Add export')
    expect(clean).toContain('#3')
    expect(clean).toContain('Dark mode')
  })
})

describe('fields', () => {
  test('lists fields that have values', async () => {
    const { out, exitCode } = await run('fields')
    expect(exitCode).toBe(0)
    expect(out).toContain('status')
    expect(out).toContain('type')
    expect(out).toContain('tags')
  })
})

describe('values', () => {
  test('lists all distinct values for a field', async () => {
    const { out, exitCode } = await run('values', 'status')
    expect(exitCode).toBe(0)
    expect(out).toContain('active')
    expect(out).toContain('new')
  })

  test('lists tag values from array fields', async () => {
    const { out, exitCode } = await run('values', 'tags')
    expect(exitCode).toBe(0)
    expect(out).toContain('FE')
    expect(out).toContain('BE')
  })
})

describe('with', () => {
  test('filters todos by field value', async () => {
    const { out, exitCode } = await run('with', 'status', 'active')
    const clean = strip(out)
    expect(exitCode).toBe(0)
    expect(clean).toContain('#1')
    expect(clean).toContain('Fix login')
    expect(clean).toContain('#3')
    expect(clean).not.toContain('#2')
  })

  test('empty value matches todos where field is absent or empty', async () => {
    // todo 2 (BE only) and 3 (untagged) don't match type=bug
    const { out, exitCode } = await run('with', 'type', 'bug')
    const clean = strip(out)
    expect(exitCode).toBe(0)
    expect(clean).toContain('#1')
    expect(clean).not.toContain('#2')
  })
})

describe('view', () => {
  test('applies a named view from config', async () => {
    const { out, exitCode } = await run('view', 'bugs')
    const clean = strip(out)
    expect(exitCode).toBe(0)
    expect(clean).toContain('#1')
    expect(clean).not.toContain('#2')
    expect(clean).not.toContain('#3')
  })

  test('unknown view name shows available views', async () => {
    const { out, exitCode } = await run('view', 'nonexistent')
    expect(exitCode).toBe(0)
    expect(out).toContain('nonexistent')
    expect(out).toContain('available')
    expect(out).toContain('bugs')
  })
})

describe('<id>', () => {
  test('shows full detail for a todo', async () => {
    const { out, exitCode } = await run('1')
    const clean = strip(out)
    expect(exitCode).toBe(0)
    expect(clean).toContain('Fix login')
    expect(clean).toContain('status')
    expect(clean).toContain('active')
    expect(clean).toContain('type')
    expect(clean).toContain('bug')
    expect(clean).toContain('tags')
    expect(clean).toContain('FE')
    expect(clean).toContain('Bug description')
    expect(clean).toContain('created')
    expect(clean).toContain('updated')
  })

  test('prints error for an unknown id', async () => {
    const { err, exitCode } = await run('99')
    expect(exitCode).toBe(1)
    expect(err).toContain('Error')
    expect(err).toContain('99')
  })
})

describe('<id> tag add', () => {
  test('adds a tag and echoes the updated todo', async () => {
    const { out, exitCode } = await run('1', 'tag', 'add', 'urgent')
    const clean = strip(out)
    expect(exitCode).toBe(0)
    expect(clean).toContain('Fix login')
    // verify persisted
    const file = await readFile(join(tmpDir, 'todos', '1-fix-login.md'), 'utf8')
    expect(file).toContain('urgent')
  })

  test('removing the untagged sentinel when adding a real tag', async () => {
    // todo 3 has 'untagged' tag
    await run('3', 'tag', 'add', 'newtag')
    const file = await readFile(join(tmpDir, 'todos', '3-dark-mode.md'), 'utf8')
    expect(file).not.toContain('untagged')
    expect(file).toContain('newtag')
  })
})

describe('<id> tag remove', () => {
  test('removes a tag and echoes the updated todo', async () => {
    const { out, exitCode } = await run('1', 'tag', 'remove', 'FE')
    const clean = strip(out)
    expect(exitCode).toBe(0)
    expect(clean).toContain('Fix login')
    const file = await readFile(join(tmpDir, 'todos', '1-fix-login.md'), 'utf8')
    expect(file).not.toContain('FE')
  })
})

describe('<id> set', () => {
  test('updates a writable field and echoes the todo', async () => {
    const { out, exitCode } = await run('1', 'set', 'status', 'done')
    const clean = strip(out)
    expect(exitCode).toBe(0)
    expect(clean).toContain('Fix login')
    const file = await readFile(join(tmpDir, 'todos', '1-fix-login.md'), 'utf8')
    expect(file).toContain('done')
  })

  test('rejects setting a read-only field with an error', async () => {
    const { err, exitCode } = await run('1', 'set', 'id', '999')
    expect(exitCode).toBe(1)
    expect(err).toContain('Error')
    expect(err).toContain('read-only')
  })
})

describe('create', () => {
  test('creates a todo with default type and slug-derived title', async () => {
    const { out, exitCode } = await run('create', 'my-new-task')
    const clean = strip(out)
    expect(exitCode).toBe(0)
    expect(clean).toContain('my new task')
  })

  test('creates a todo with an explicit type', async () => {
    const { out, exitCode } = await run('create', 'bug', 'the-crash')
    const clean = strip(out)
    expect(exitCode).toBe(0)
    expect(clean).toContain('the crash')
  })

  test('creates a todo with tags (trimmed)', async () => {
    await run('create', 'tagged-task', '#foo, bar')
    // find and parse the created file to check actual tag values
    const files = await import('node:fs/promises').then(m =>
      m.readdir(join(tmpDir, 'todos'))
    )
    const newFile = files.find(f => f.includes('tagged-task'))!
    const content = await readFile(join(tmpDir, 'todos', newFile), 'utf8')
    const { parse } = await import('./todos')
    const todo = parse(content, newFile)
    expect(todo.tags).toContain('foo')
    expect(todo.tags).toContain('bar')
    expect(todo.tags?.every(t => t === t.trim())).toBe(true)
  })

  test('creates a todo with type and tags', async () => {
    const { out, exitCode } = await run('create', 'feature', 'new-widget', '#ui,backend')
    const clean = strip(out)
    expect(exitCode).toBe(0)
    expect(clean).toContain('new widget')
  })
})

describe('unrecognised input', () => {
  test('two-token unrecognised path shows help', async () => {
    // A single unknown token always routes to <id> (which then throws "not found").
    // Two tokens where the second doesn't match any <id> subcommand produce RouteNotFound → help.
    const { out, exitCode } = await run('unknown-id', 'bad-subcommand')
    expect(exitCode).toBe(0)
    expect(out).toContain('Usage: todos <command>')
  })
})
