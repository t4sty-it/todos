import { doc, helpText, select, match, terminal, type Route, type Router } from "@/utils/router";



export const help: (router: () => Router<Route<string>, string>) => Router<Route<string>, string> =
  router =>
    doc('--help, -h', 'Print help',
      select(
        match('--help', terminal(_ => helpText(router()))),
        match('-h', terminal(_ => helpText(router()))),
      )
    )