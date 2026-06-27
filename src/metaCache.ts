import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { basename, resolve, relative, join } from 'node:path'
import { useCache } from './utils/useCache'
import { parse, FILENAME_RE } from './todos'

const SCHEMA_VERSION = 3

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

const runGit = (args: string[], cwd?: string): Promise<string> => {
  const proc = Bun.spawn(['git', ...args], { cwd, stdout: 'pipe', stderr: 'pipe' })
  return new Response(proc.stdout).text()
}

interface BlobEntry {
  sha: string
  gitRoot: string
  relFilePathFromGitRoot: string
}

const fetchBlobShasForPath = async (configPath: string): Promise<Map<string, BlobEntry>> => {
  const map = new Map<string, BlobEntry>()
  const absPath = resolve(configPath)

  const gitRoot = (await runGit(['-C', absPath, 'rev-parse', '--show-toplevel'])).trim()
  if (!gitRoot) return map

  const relFromGitRoot = relative(gitRoot, absPath)
  const gitPathPrefix = relFromGitRoot ? `${relFromGitRoot}/` : ''

  const output = await runGit(
    ['ls-files', '--format=%(objectname) %(path)', '--', gitPathPrefix || '.'],
    gitRoot
  )

  for (const line of output.trim().split('\n').filter(Boolean)) {
    const spaceIdx = line.indexOf(' ')
    const sha = line.slice(0, spaceIdx)
    const relToGitRoot = line.slice(spaceIdx + 1)
    const filename = gitPathPrefix && relToGitRoot.startsWith(gitPathPrefix)
      ? relToGitRoot.slice(gitPathPrefix.length)
      : relToGitRoot
    const key = join(configPath, filename)
    map.set(key, { sha, gitRoot, relFilePathFromGitRoot: relToGitRoot })
  }
  return map
}

const fetchBlobShas = async (paths: string[]): Promise<Map<string, BlobEntry>> => {
  const map = new Map<string, BlobEntry>()
  for (const configPath of paths) {
    const entries = await fetchBlobShasForPath(configPath)
    for (const [key, entry] of entries) map.set(key, entry)
  }
  return map
}

const buildMetaCache = async (paths: string[]): Promise<Map<string, MetaMapEntry>> => {
  const [stored, blobInfos] = await Promise.all([readMetaStore(), fetchBlobShas(paths)])

  const blobShas = new Map([...blobInfos.entries()].map(([k, v]) => [k, v.sha]))

  const stale = [...blobInfos.entries()]
    .filter(([filename]) => FILENAME_RE.test(basename(filename)))
    .filter(([filename, { sha }]) => {
      const entry = stored[filename]
      return !entry || entry.blobSha !== sha || entry.schemaVersion !== SCHEMA_VERSION
    })
    .map(([filename]) => filename)

  if (stale.length > 0) {
    const updates = (await Promise.all(
      stale.map(async filename => {
        const info = blobInfos.get(filename)!
        const filepath = info.relFilePathFromGitRoot
        let text: string
        try {
          text = await Bun.file(filename).text()
        } catch {
          return null
        }
        const [createdAt, updatedAt] = await Promise.all([
          runGit(['log', '--diff-filter=A', '--format=%cI', '-1', '--', filepath], info.gitRoot).then(s => s.trim()),
          runGit(['log', '--format=%cI', '-1', '--', filepath], info.gitRoot).then(s => s.trim()),
        ])
        if (!createdAt || !updatedAt) {
          process.stderr.write(`Warning: no git dates found for ${filename} (may not be committed yet); it will be excluded from listings\n`)
        }
        const { title, status, type, tags } = parse(text, filename)
        return {
          filename,
          blobSha: info.sha,
          schemaVersion: SCHEMA_VERSION,
          createdAt, updatedAt,
          id: FILENAME_RE.exec(basename(filename))![1]!,
          title, status, type, tags,
        }
      })
    )).filter(u => u !== null)
    for (const { filename, ...entry } of updates) {
      stored[filename] = entry
    }
    await mkdir(cacheDir, { recursive: true })
    await writeFile(cachePath, JSON.stringify(stored, null, 2))
  }

  const result = new Map<string, MetaMapEntry>()
  for (const [filename, entry] of Object.entries(stored)) {
    if (!FILENAME_RE.test(basename(filename))) continue
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

let _paths: string[] = ['todos']
let _cache = useCache(() => buildMetaCache(_paths))

export const setMetaCachePaths = (paths: string[]) => {
  if (JSON.stringify(_paths) !== JSON.stringify(paths)) {
    _paths = paths
    _cache = useCache(() => buildMetaCache(_paths))
  }
}

export const loadMetaCache = () => _cache()
export const resetMetaCache = () => { _cache = useCache(() => buildMetaCache(_paths)) }

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
