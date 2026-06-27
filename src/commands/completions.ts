import { completionCandidates, doc, match, param, rest, select, terminal, type Route, type Router } from "@/utils/router"

export const completions =
  (router: () => Router<Route<string>, string>) =>
    doc('completions bash', 'Print bash completion script (eval "$(todos completions bash)")',
      match('completions',
        select(
          match('bash', terminal(_ => bashCompletionScript)),
          match('query',
            param('cword',
              rest('args', terminal(async r => {
                const cword = parseInt(r.params['cword']!)
                const words = (r.params['args'] ?? '').split(' ').filter(Boolean)
                const preceding = words.slice(1, cword)
                return (await completionCandidates(router(), preceding)).join('\n')
              }))
            )
          ),
        )
      )
    )

const bashCompletionScript = `\
  _todos_complete() {
    COMPREPLY=(\$(compgen -W "\$(todos completions query \$COMP_CWORD "\${COMP_WORDS[@]}" 2>/dev/null)" -- "\${COMP_WORDS[COMP_CWORD]}"))
  }
  complete -F _todos_complete todos`