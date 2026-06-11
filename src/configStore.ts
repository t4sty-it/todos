import { emptyConfig, type Config } from './config'
import { useCache } from './utils/useCache'

export interface ConfigStore {
  get(): Promise<Config>
}

const configFile = 'todosConfig.json'

export const useConfigStore = (): ConfigStore => {
  const config = useCache(() => loadConfig())
  return { get: () => config() }
}

const loadConfig = async (): Promise<Config> => {
  try {
    const text = await Bun.file(configFile).text()
    return JSON.parse(text) as Config
  } catch {
    return emptyConfig
  }
}
