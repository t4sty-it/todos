import { prompt, write } from "./io"
import { menu, prev, result, run, strafe, stroll, walk, type Menu } from "./menu"
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


// if (process.argv.length > 2) {
//   walk(appMenu, process.argv.slice(2)).then(maybeWrite)
// } else {
//   await stroll(appMenu, async menu => {
//     return await prompt(
//       Object.keys(menu.value).map(k => `- ${k}`).join('\n')
//     )
//   }).then(maybeWrite)
// }
strafe(
  appMenu,
  process.argv.slice(2),
  menu => prompt(
    Object.keys(menu.value).map(k => `- ${k}`).join('\n')
  )
).then(maybeWrite)

function maybeWrite(x: any | undefined) {
  if (x) write(x.toString())
}

function resultList(x: string[]) {
  return result(x.join('\n'))
}