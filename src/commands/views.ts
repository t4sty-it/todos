import { doc, match, terminal, type Route, type Router } from "@/utils/router"
import type { Config } from "@/config"
import { writeList } from "@/display"

export const views = (config: Config): Router<Route<string>, string> =>
  doc('views', 'List available view names',
    match('views', terminal(_ => writeList(Object.keys(config.views ?? {}))))
  )
