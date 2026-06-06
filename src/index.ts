import { prompt, write } from "./io"
import { menu, prev, result, run, walk, type Menu } from "./menu"
import { useTodoStore } from "./todoStore"
import { maybeApply } from "./utils/ProviderOr"

const todos = useTodoStore()

const appMenu: Menu = menu({
  all: () =>
    todos.all()
      .then(todos => todos.map(t => t.title))
      .then(resultList),
  
  fields: () =>
    todos.fields().then(resultList),
  
  values:
    todos.fields().then(
      fields => menu(Object.fromEntries(fields.map(
        field => [field, () => todos.fieldValues(field).then(resultList)]
      )))
    ),

  with:
    todos.fields().then(
      fields => menu(Object.fromEntries(fields.map(
        field => [
          field,
          () => todos.fieldValues(field)
              .then(values => menu(Object.fromEntries(values.map(
                value => [
                  value,
                  todos.filterBy(field, value)
                    .then(todos => todos.map(t => t.title))
                    .then(resultList)
                ]
              ))))
        ]
      )))
    )
})


if (process.argv.length > 0) {
  walk(appMenu, process.argv.slice(2)).then(maybeWrite)
} else {
  console.log('run')
  await run<number>(
    appMenu,
    async cur => {

      const choice = await prompt((
        Object.keys(cur.value).map(k => `- ${k}`).join('\n')
      ))
  
      if (choice === '..') return prev()
  
      if (cur.value[choice] == null)
        throw '`${choice} is not a valid choice'
  
      return maybeApply(cur.value[choice])
    }
  ).then(maybeWrite)

}


function maybeWrite(x: any | undefined) {
  if (x) write(x.toString())
}

function resultList(x: string[]) {
  return result(x.join('\n'))
}