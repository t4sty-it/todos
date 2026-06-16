import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { useCache } from './utils/useCache'
import { parse, FILENAME_RE } from './todos'

const SCHEMA_VERSION = 2

interface MetaEntry {
  blobSha: string
  schemaVersion: number
  createdAt: string
  updatedAt: string
  id: string
  title: string
  status?: string
  type?: string
  tags?: string[]
}

type MetaStore = Record<string, MetaEntry>

export type MetaMapEntry = {
  createdAt: Date
  updatedAt: Date
  id: string
  title: string
  status?: string
  type?: string
  tags?: string[]
}

const cacheDir = '.todos'
const cachePath = `${cacheDir}/meta.json`

const readMetaStore = async (): Promise<MetaStore> => {
  try {
    return JSON.parse(await readFile(cachePath, 'utf8'))
  } catch {
    return {}
  }
}

const runGit = (args: string[]): Promise<string> => {
  const proc = Bun.spawn(['git', ...args], { stdout: 'pipe', stderr: 'pipe' })
  return new Response(proc.stdout).text()
}

const fetchBlobShas = async (): Promise<Map<string, string>> => {
  const output = await runGit(['ls-files', '--format=%(objectname) %(path)', '--', 'todos/'])
  const map = new Map<string, string>()
  for (const line of output.trim().split('\n').filter(Boolean)) {
    const spaceIdx = line.indexOf(' ')
    const sha = line.slice(0, spaceIdx)
    const fullPath = line.slice(spaceIdx + 1)
    const filename = fullPath.replace('todos/', '')
    map.set(filename, sha)
  }
  return map
}

const buildMetaCache = async (): Promise<Map<string, MetaMapEntry>> => {
  const [stored, blobShas] = await Promise.all([readMetaStore(), fetchBlobShas()])

  const stale = [...blobShas.entries()]
    .filter(([filename]) => FILENAME_RE.test(filename))
    .filter(([filename, sha]) => {
      const entry = stored[filename]
      return !entry || entry.blobSha !== sha || entry.schemaVersion !== SCHEMA_VERSION
    })
    .map(([filename]) => filename)

  if (stale.length > 0) {
    const updates = await Promise.all(
      stale.map(async filename => {
        const filepath = `todos/${filename}`
        const [text, createdAt, updatedAt] = await Promise.all([
          Bun.file(filepath).text(),
          runGit(['log', '--diff-filter=A', '--format=%cI', '-1', '--', filepath]).then(s => s.trim()),
          runGit(['log', '--format=%cI', '-1', '--', filepath]).then(s => s.trim()),
        ])
        if (!createdAt || !updatedAt) {
          process.stderr.write(`Warning: no git dates found for ${filename} (may not be committed yet); it will be excluded from listings\n`)
        }
        const { title, status, type, tags } = parse(text, filename)
        return {
          filename,
          blobSha: blobShas.get(filename)!,
          schemaVersion: SCHEMA_VERSION,
          createdAt, updatedAt,
          id: FILENAME_RE.exec(filename)![1]!,
          title, status, type, tags,
        }
      })
    )
    for (const { filename, ...entry } of updates) {
      stored[filename] = entry
    }
    await mkdir(cacheDir, { recursive: true })
    await writeFile(cachePath, JSON.stringify(stored, null, 2))
  }

  const result = new Map<string, MetaMapEntry>()
  for (const [filename, entry] of Object.entries(stored)) {
    if (!FILENAME_RE.test(filename)) continue
    const createdAt = entry.createdAt ? new Date(entry.createdAt) : undefined
    const updatedAt = entry.updatedAt ? new Date(entry.updatedAt) : undefined
    if (createdAt && updatedAt && !isNaN(createdAt.getTime()) && !isNaN(updatedAt.getTime())) {
      result.set(filename, {
        createdAt, updatedAt,
        id: entry.id, title: entry.title,
        status: entry.status, type: entry.type, tags: entry.tags,
      })
    } else if (blobShas.has(filename)) {
      process.stderr.write(`Warning: ${filename} has invalid dates in cache; it will be excluded from listings\n`)
    }
  }
  return result
}

let _cache = useCache(buildMetaCache)
export const loadMetaCache = () => _cache()
export const resetMetaCache = () => { _cache = useCache(buildMetaCache) }

type MetaCachePatch = Partial<Pick<MetaMapEntry, 'title' | 'status' | 'type' | 'tags'>>

export const patchMetaCacheEntry = async (filename: string, updates: MetaCachePatch) => {
  const map = await loadMetaCache()
  const mapEntry = map.get(filename)
  if (mapEntry) Object.assign(mapEntry, updates)

  const stored = await readMetaStore()
  if (stored[filename]) {
    Object.assign(stored[filename], updates)
    await writeFile(cachePath, JSON.stringify(stored, null, 2))
  }
}
