import { describe, test, expect, beforeAll} from 'bun:test'
import { mkdir, rm } from 'node:fs/promises'
import { cacheFolder, mainFolder } from './folder'
import { afterEach } from 'node:test'
import path from 'node:path'
import { stringify, type Todo } from './todos'

describe('folder', async () => {

  beforeAll(async () => {
    process.chdir('/tmp/' + Math.random().toString().slice(2))
    await mkdir(mainFolder)
    await mkdir(cacheFolder)
  })

  afterEach(async () => {
    await rm(path.join(cacheFolder, '*'), {recursive: true, force: true})
    await rm(path.join(mainFolder, '*'), {recursive: true, force: true})
  })

  const write = async (t: Todo): Promise<void> => {
    Bun.write(
      Bun.file(path.join(mainFolder, t.url)),
      stringify(t)
    )
  }

  await test('update index', async () => {
    await write({
      id: 'test',
      url: 'test.md',
      title: 'Title',
      description: 'description',
      status: 'in_progress',
      tags: ['BE'],
      type: 'bug'
    })
  })
})