import { doc, match, select, terminal } from "@/utils/router";
import pkg from '../../package.json'

export const version = doc('--version, -v', 'Print version',
    select(
      match('--version', terminal(_ => pkg.version)),
      match('-v',        terminal(_ => pkg.version)),
    )
  )