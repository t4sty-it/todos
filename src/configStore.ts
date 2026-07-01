import { emptyConfig, validateConfig, type Config } from './config'
import { useCache } from './utils/useCache'

export interface ConfigStore {
  get(): Promise<Config>
}

const configFile = 'todosConfig.json'

export const useConfigStore = (): ConfigStore => {
  const config = useCache(() => loadConfig())
  return { get: () => config() }
}

const jsonString = /"(?:[^"\\]|\\.)*"/
const lineComment = /\/\/[^\n]*/
const blockComment = /\/\*[\s\S]*?\*\//

const stripJsonComments = (src: string): string =>
  src.replace(
    new RegExp(`${jsonString.source}|${lineComment.source}|${blockComment.source}`, 'g'),
    token => (token.startsWith('"') ? token : ''),
  )

const loadConfig = async (): Promise<Config> => {
  const file = Bun.file(configFile)
  if (!await file.exists()) return emptyConfig
  try {
    return validateConfig(JSON.parse(stripJsonComments(await file.text())))
  } catch (e) {
    process.stderr.write(`Warning: failed to parse ${configFile}: ${e}\n`)
    return emptyConfig
  }
}
