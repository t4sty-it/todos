export type ViewCondition = Record<string, string>

export interface View {
  include?: ViewCondition[]
  exclude?: ViewCondition[]
  sort?: string[]
}

export interface Config {
  editor?: string
  display?: {
    [field: string]: {
      [value: string]: string
    }
  }
  views?: { [name: string]: View }
}

export const emptyConfig: Config = {}

const ansiCodes: Record<string, string> = {
  bold:      '\x1b[1m',
  dim:       '\x1b[2m',
  italic:    '\x1b[3m',
  underline: '\x1b[4m',
  black:     '\x1b[30m',
  red:       '\x1b[31m',
  green:     '\x1b[32m',
  yellow:    '\x1b[33m',
  blue:      '\x1b[34m',
  magenta:   '\x1b[35m',
  cyan:      '\x1b[36m',
  white:     '\x1b[37m',
  gray:      '\x1b[90m',
  grey:      '\x1b[90m',
}

const reset = '\x1b[0m'

export const applyDisplay = (
  text: string,
  fields: Record<string, unknown>,
  config: Config
): string => {
  if (!config.display) return text

  const tokens = new Set<string>()

  for (const [field, fieldConfig] of Object.entries(config.display)) {
    const value = fields[field]
    const values = Array.isArray(value) ? value : value != null ? [String(value)] : []
    for (const v of values) {
      const style = fieldConfig[v]
      if (style) style.split(/\s+/).forEach(t => tokens.add(t))
    }
  }

  if (tokens.size === 0) return text

  const prefix = [...tokens].map(t => ansiCodes[t] ?? '').join('')
  return `${prefix}${text}${reset}`
}

const compareValues = (a: string, b: string): number => {
  const na = Number(a), nb = Number(b)
  if (a !== '' && b !== '' && isFinite(na) && isFinite(nb)) return na - nb
  return a.localeCompare(b)
}

export const applyView = (
  items: Record<string, unknown>[],
  view: View
): Record<string, unknown>[] => {
  let result = items

  if (view.include && view.include.length > 0) {
    result = result.filter(item =>
      view.include!.every(condition => {
        const [field, expected] = Object.entries(condition)[0]!
        const actual = item[field]
        if (Array.isArray(actual)) return actual.includes(expected)
        return actual === expected
      })
    )
  }

  if (view.exclude && view.exclude.length > 0) {
    result = result.filter(item =>
      !view.exclude!.some(condition => {
        const [field, expected] = Object.entries(condition)[0]!
        const actual = item[field]
        if (Array.isArray(actual)) return actual.includes(expected)
        return actual === expected
      })
    )
  }

  if (view.sort && view.sort.length > 0) {
    result = [...result].sort((a, b) => {
      for (const entry of view.sort!) {
        const [field, dir] = entry.trim().split(/\s+/)
        const direction = dir?.toLowerCase() === 'desc' ? -1 : 1
        const cmp = compareValues(String(a[field!] ?? ''), String(b[field!] ?? ''))
        if (cmp !== 0) return cmp * direction
      }
      return 0
    })
  }

  return result
}
