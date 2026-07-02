import { $ } from "bun"
import { readFileSync, writeFileSync } from "fs"
import { resolve } from "path"

const version = process.argv[2]
if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  process.stderr.write("Usage: bun run release <version>  (e.g. bun run release 0.28.0)\n")
  process.exit(1)
}

const pkgPath = resolve(import.meta.dir, "../package.json")
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"))
pkg.version = version
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n")
console.log(`Bumped package.json to ${version}`)

const tag = version
await $`git add ${pkgPath}`
await $`git commit -m ${tag}`
await $`git tag ${tag}`
console.log(`Committed and tagged ${tag}`)

const remote = (await $`git remote`.text()).trim().split("\n")[0]
await $`git push ${remote}`
await $`git push ${remote} ${tag}`
console.log(`Pushed commit and tag ${tag} to ${remote}`)

const targets: { bun: string; name: string }[] = [
  { bun: "bun-linux-x64",    name: "todos-linux-x64" },
  { bun: "bun-linux-arm64",  name: "todos-linux-arm64" },
  { bun: "bun-darwin-x64",   name: "todos-darwin-x64" },
  { bun: "bun-darwin-arm64", name: "todos-darwin-arm64" },
  { bun: "bun-windows-x64",  name: "todos-windows-x64.exe" },
]

const srcDir = resolve(import.meta.dir, "..")

for (const target of targets) {
  console.log(`Building ${target.name}...`)
  await $`bun build ${srcDir}/src/index --compile --target=${target.bun} --outfile ${srcDir}/dist/${target.name}`
}

console.log(`Creating GitHub release ${tag}...`)
await $`gh release create ${tag} ${srcDir}/dist/todos-* --title ${tag} --generate-notes`

console.log(`\nDone. Release ${tag} is live.`)
