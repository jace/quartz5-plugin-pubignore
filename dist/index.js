// @jackerhack/quartz5-plugin-pubignore — runtime build (plain ESM).
//
// Hand-written JS. The only non-builtin import is `globby`, which is a Quartz
// dependency (a shared external), so it resolves from the host at runtime and
// needs no bundling. Authoritative source is ../src/index.ts — keep in sync.

import fs from "node:fs"
import path from "node:path"
import { globbySync } from "globby"

const PUBIGNORE_FILE = ".pubignore"

// Cached per build so the read + ignorePatterns mutation + glob happen once.
const stateByBuild = new Map()

function readPatterns(pubignorePath) {
  return fs
    .readFileSync(pubignorePath, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
}

function initForBuild(ctx) {
  const key = ctx.buildId
  const cached = stateByBuild.get(key)
  if (cached) return cached

  // Only the active build's state is retained.
  stateByBuild.clear()

  const dir = ctx.argv.directory
  const pubignorePath = path.join(dir, PUBIGNORE_FILE)

  let kept = null
  if (fs.existsSync(pubignorePath)) {
    const config = ctx.cfg.configuration
    const patterns = (config.ignorePatterns ??= [])
    const existing = new Set(patterns)
    for (const p of readPatterns(pubignorePath)) {
      if (!existing.has(p)) {
        patterns.push(p)
        existing.add(p)
      }
    }
    // Same globber Quartz uses (globby ignore + gitignore files), so the
    // markdown filter and the Assets emitter agree on what is published.
    kept = new Set(globbySync("**", { cwd: dir, ignore: patterns, gitignore: true, dot: true }))
  }

  const state = { kept }
  stateByBuild.set(key, state)
  return state
}

export const PubIgnore = () => ({
  name: "PubIgnore",
  shouldPublish(ctx, [, file]) {
    const { kept } = initForBuild(ctx)
    if (!kept) return true
    const rel = file.data?.relativePath
    if (!rel) return true
    return kept.has(rel)
  },
})

export default PubIgnore
