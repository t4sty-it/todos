import { doc, match, terminal } from "@/utils/router"
import { chmod, rename, writeFile } from "fs/promises"
import { tmpdir } from "os"
import { join } from "path"
import pkg from "../../package.json"

const REPO = "t4sty-it/todos"

type Asset = { name: string; browser_download_url: string }
type Release = { tag_name: string; assets: Asset[] }

function platformAssetName(): string {
  const p = process.platform
  const a = process.arch
  if (p === "linux"  && a === "x64")   return "todos-linux-x64"
  if (p === "linux"  && a === "arm64") return "todos-linux-arm64"
  if (p === "darwin" && a === "x64")   return "todos-darwin-x64"
  if (p === "darwin" && a === "arm64") return "todos-darwin-arm64"
  if (p === "win32"  && a === "x64")   return "todos-windows-x64.exe"
  throw new Error(`Unsupported platform: ${p}/${a}`)
}

async function fetchLatestRelease(): Promise<Release> {
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
    headers: { "User-Agent": "todos-cli" },
  })
  if (!res.ok) throw new Error(`GitHub API error: ${res.status} ${res.statusText}`)
  return res.json() as Promise<Release>
}

export const upgrade = doc("--upgrade", "Upgrade to the latest version",
  match("--upgrade", terminal(async _ => {
    const assetName = platformAssetName()
    const release = await fetchLatestRelease()
    const latestVersion = release.tag_name

    if (latestVersion === pkg.version) {
      return `Already up to date (v${pkg.version})`
    }

    const asset = release.assets.find(a => a.name === assetName)
    if (!asset) {
      throw new Error(`No binary found for ${assetName} in release ${release.tag_name}`)
    }

    const res = await fetch(asset.browser_download_url)
    if (!res.ok) throw new Error(`Download failed: ${res.status} ${res.statusText}`)

    const tmp = join(tmpdir(), `todos-upgrade-${Date.now()}`)
    await writeFile(tmp, Buffer.from(await res.arrayBuffer()))
    await chmod(tmp, 0o755)
    await rename(tmp, process.execPath)

    const completion = Bun.spawnSync([process.execPath, "completions", "bash"])
    if (completion.stdout.byteLength > 0) {
      const completionPath = `${process.env.HOME}/.bash_completion.d/todos`
      await writeFile(completionPath, completion.stdout)
    }

    return `Updated to version ${latestVersion}`
  }))
)
