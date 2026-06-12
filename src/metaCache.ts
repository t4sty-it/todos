import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { useCache } from './utils/useCache'

interface MetaEntry {
  blobSha: string
  createdAt: string
  updatedAt: string
}

type MetaStore = Record<string, MetaEntry>

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

const buildMetaCache = async (): Promise<Map<string, { createdAt: Date, updatedAt: Date }>> => {
  const [stored, blobShas] = await Promise.all([readMetaStore(), fetchBlobShas()])

  const stale = [...blobShas.entries()]
    .filter(([filename, sha]) => stored[filename]?.blobSha !== sha)
    .map(([filename]) => filename)

  if (stale.length > 0) {
    const updates = await Promise.all(
      stale.map(async filename => {
        const filepath = `todos/${filename}`
        const [createdAt, updatedAt] = await Promise.all([
          runGit(['log', '--diff-filter=A', '--format=%cI', '-1', '--', filepath]).then(s => s.trim()),
          runGit(['log', '--format=%cI', '-1', '--', filepath]).then(s => s.trim()),
        ])
        return { filename, blobSha: blobShas.get(filename)!, createdAt, updatedAt }
      })
    )
    for (const { filename, blobSha, createdAt, updatedAt } of updates) {
      stored[filename] = { blobSha, createdAt, updatedAt }
    }
    await mkdir(cacheDir, { recursive: true })
    await writeFile(cachePath, JSON.stringify(stored, null, 2))
  }

  const result = new Map<string, { createdAt: Date, updatedAt: Date }>()
  for (const [filename, entry] of Object.entries(stored)) {
    if (entry.createdAt && entry.updatedAt) {
      result.set(filename, { createdAt: new Date(entry.createdAt), updatedAt: new Date(entry.updatedAt) })
    }
  }
  return result
}

export const loadMetaCache = useCache(buildMetaCache)
