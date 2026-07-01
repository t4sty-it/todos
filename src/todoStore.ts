import { parse, patch, stringify, extractRefs, FILENAME_RE, type Todo } from "./todos";
import { applyView, type View } from "./config";

import { readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { useCache } from "./utils/useCache";
import { loadMetaCache, resetMetaCache, patchMetaCacheEntry, setMetaCachePaths } from "./metaCache";
import { useConfigStore } from "./configStore";

export interface TodoStore {
  all(): Promise<Todo[]>,
  fields(): Promise<string[]>,
  fieldValues(field: string): Promise<string[]>,
  filterBy(field: string, value: string): Promise<Todo[]>,
  search(query: string): Promise<Todo[]>,
  references(id: string): Promise<Todo[]>,
  get(id: string): Promise<Todo>,
  reload(): void,
  tag(id: string, op: 'add' | 'remove', tag: string): Promise<Todo>,
  set(id: string, field: string, value: string): Promise<Todo>,
  create(slug: string, type?: string, tags?: string[]): Promise<Todo>,
  view(config: View): Promise<Todo[]>
}

const KNOWN_TODO_FIELDS = new Set(['id', 'url', 'title', 'description', 'status', 'type', 'tags', 'extraFields', 'createdAt', 'updatedAt'])

const getField = (todo: Todo, field: string): string | string[] | undefined => {
  if (KNOWN_TODO_FIELDS.has(field)) return todo[field as keyof Todo] as string | string[] | undefined
  return todo.extraFields?.[field]
}

export const useTodoStore = (): TodoStore => {

  const configStore = useConfigStore()

  const getPaths = async (): Promise<string[]> => {
    const config = await configStore.get()
    return (config.paths && config.paths.length > 0) ? config.paths : ['todos']
  }

  const buildAllListings = async (): Promise<Todo[]> => {
    const paths = await getPaths()
    setMetaCachePaths(paths)
    const results = await Promise.all(paths.map(p => buildListing(p)))
    return results.flat()
  }

  let todos = useCache(buildAllListings)

  return {
    all: () => todos(),
    fields: async () => {
      const result = new Set<string>()
      await todos().then(todos => {
        for (const todo of todos) {
          if (todo.status) result.add('status')
          if (todo.tags) result.add('tags')
          if (todo.type) result.add('type')
          for (const key of Object.keys(todo.extraFields ?? {})) result.add(key)
        }
      })

      return result.values().toArray()
    },
    fieldValues: async field => {
      const result = new Set<string>()
      await todos().then(todos => {
        for (const todo of todos) {
          const v = getField(todo, field)
          if (typeof v === 'string') result.add(v)
          else if (Array.isArray(v)) v.forEach(value => result.add(value))
        }
      })

      return result.values().toArray()
    },
    filterBy: async (field, value) => {
      return (await todos()).filter(todo => {
        const v = getField(todo, field)
        if (value === '') return v == null || v === '' || (Array.isArray(v) && v.length === 0)
        return typeof v === 'string'
          ? v === value
          : Array.isArray(v)
            ? v.includes(value)
            : false
      })
    },
    create: async (slug, type = 'task', tags = ['untagged']) => {
      const paths = await getPaths()
      const firstPath = paths[0]!
      const all = await todos()
      const maxId = all.reduce((max, t) => Math.max(max, parseInt(t.id, 10)), 0)
      const newId = String(maxId + 1)
      const filename = `${newId}-${slug}.md`
      const url = join(firstPath, filename)
      const title = slug.replace(/-/g, ' ')
      const todo: Todo = { id: newId, url, title, status: 'new', type, tags }
      await writeFile(url, stringify(todo))
      todos = useCache(buildAllListings)
      return todo
    },
    search: async (query: string) => {
      const listing = await todos()
      const withContent = await Promise.all(
        listing.map(async todo => {
          const text = await Bun.file(todo.url).text()
          const full = parse(text, todo.url)
          full.createdAt = todo.createdAt
          full.updatedAt = todo.updatedAt
          return full
        })
      )

      const searchText = (todo: Todo) => [
        todo.title,
        todo.description ?? '',
        todo.status ?? '',
        todo.type ?? '',
        ...(todo.tags ?? []),
        ...Object.values(todo.extraFields ?? {}).flat()
      ].join(' ')

      const exact = withContent.filter(t => searchText(t).toLowerCase().includes(query.toLowerCase()))
      const exactIds = new Set(exact.map(t => t.id))

      const fuzzyPattern = new RegExp(
        query.toLowerCase().split('').map(c => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*'),
        'i'
      )
      const fuzzy = withContent.filter(t => !exactIds.has(t.id) && fuzzyPattern.test(searchText(t)))

      return [...exact, ...fuzzy]
    },
    references: async (id: string) => {
      const meta = await loadMetaCache()
      return [...meta.entries()]
        .filter(([, entry]) => entry.referencedIds?.includes(id))
        .map(([url, entry]) => ({
          id: entry.id,
          url,
          title: entry.title,
          status: entry.status,
          type: entry.type,
          tags: entry.tags,
          extraFields: entry.extraFields,
          createdAt: () => Promise.resolve(entry.createdAt),
          updatedAt: () => Promise.resolve(entry.updatedAt),
        } satisfies Todo))
    },
    get: async id => {
      const listing = (await todos()).find(t => t.id === id)
      if (!listing) throw new Error(`Todo not found: ${id}`)
      const text = await Bun.file(listing.url).text()
      const todo = parse(text, listing.url)
      todo.createdAt = listing.createdAt
      todo.updatedAt = listing.updatedAt
      return todo
    },
    reload: () => {
      todos = useCache(buildAllListings)
      resetMetaCache()
    },
    tag: async (id, op, tagName) => {
      const all = await todos()
      const todo = all.find(t => t.id === id)
      if (!todo) throw new Error(`Todo not found: ${id}`)

      const current = todo.tags ?? []
      const newTags = op === 'add'
        ? [...new Set([...current, tagName])].filter(t => t !== 'untagged')
        : current.filter(t => t !== tagName)

      const filePath = todo.url
      const text = await Bun.file(filePath).text()
      await writeFile(filePath, patch(text, 'tags', newTags))

      await patchMetaCacheEntry(todo.url, { tags: newTags })

      todos = useCache(buildAllListings)
      return { ...todo, tags: newTags }
    },
    view: async (viewConfig) => {
      const all = await todos()
      return applyView(all, viewConfig)
    },
    set: async (id, field, value) => {
      const readonlyFields = ['id', 'url', 'createdAt', 'updatedAt']
      if (readonlyFields.includes(field)) throw new Error(`Field "${field}" is read-only`)
      const all = await todos()
      const todo = all.find(t => t.id === id)
      if (!todo) throw new Error(`Todo not found: ${id}`)

      const filePath = todo.url
      const text = await Bun.file(filePath).text()
      const patchedText = patch(text, field, value)
      await writeFile(filePath, patchedText)
      const referencedIds = extractRefs(patchedText)

      if (field === 'title') await patchMetaCacheEntry(todo.url, { title: value, referencedIds })
      else if (field === 'status') await patchMetaCacheEntry(todo.url, { status: value })
      else if (field === 'type') await patchMetaCacheEntry(todo.url, { type: value })
      else if (field === 'tags') await patchMetaCacheEntry(todo.url, { tags: value.split(',').map(s => s.trim()) })
      else {
        const newExtraFields = { ...(todo.extraFields ?? {}), [field]: value }
        await patchMetaCacheEntry(todo.url, { extraFields: newExtraFields, referencedIds })
        todos = useCache(buildAllListings)
        return { ...todo, extraFields: newExtraFields }
      }

      todos = useCache(buildAllListings)
      return { ...todo, [field]: value }
    }
  }
}

const buildListing = async (folderPath: string): Promise<Todo[]> => {
  const [allFiles, meta] = await Promise.all([readdir(folderPath, { recursive: true }), loadMetaCache()])

  const mdFiles = (allFiles as string[]).filter(f => f.endsWith('.md'))

  const conforming = mdFiles.filter(f => {
    const base = f.split('/').at(-1)!
    if (FILENAME_RE.test(base)) return true
    process.stderr.write(`Warning: ignoring ${f}: does not match expected format <id>-<slug>.md\n`)
    return false
  })

  const idFiles = new Map<string, string[]>()
  for (const f of conforming) {
    const id = FILENAME_RE.exec(f.split('/').at(-1)!)![1]!
    idFiles.set(id, [...(idFiles.get(id) ?? []), f])
  }
  const duplicateIds = new Set<string>()
  for (const [id, filenames] of idFiles) {
    if (filenames.length > 1) {
      process.stderr.write(`Warning: ignoring ${filenames.join(' and ')}: duplicate id ${id}\n`)
      duplicateIds.add(id)
    }
  }
  const valid = conforming.filter(f => !duplicateIds.has(FILENAME_RE.exec(f.split('/').at(-1)!)![1]!))

  return Promise.all(
    valid.map(async f => {
      const url = join(folderPath, f)
      const cached = meta.get(url)
      if (cached) {
        return {
          id: cached.id,
          url,
          title: cached.title,
          status: cached.status,
          type: cached.type,
          tags: cached.tags,
          extraFields: cached.extraFields,
          createdAt: () => Promise.resolve(cached.createdAt),
          updatedAt: () => Promise.resolve(cached.updatedAt),
        } satisfies Todo
      }
      const text = await Bun.file(url).text()
      const todo = parse(text, url)
      todo.createdAt = () => loadMetaCache().then(m => m.get(url)?.createdAt)
      todo.updatedAt = () => loadMetaCache().then(m => m.get(url)?.updatedAt)
      return todo
    })
  )
}
