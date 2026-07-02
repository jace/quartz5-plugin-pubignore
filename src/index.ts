import type { QuartzFilterPlugin, BuildCtx } from "@quartz-community/types"
import fs from "node:fs"
import path from "node:path"
import { globbySync } from "globby"

/**
 * .pubignore
 * ==========
 *
 * Confidentiality gate for a Quartz v5 site whose content lives in a SEPARATE
 * repo from the Quartz config. Reads a `.pubignore` file from the content root
 * and withholds matching paths from the build.
 *
 * Why the content repo, not quartz.config.yaml: the ignore list must travel
 * atomically with the content it governs. The Quartz fork is a separate (often
 * public) repo, so keeping a second copy of the list there is the core leak
 * risk — a drifting copy. `.pubignore` is the single source of truth, read at
 * build time from `ctx.argv.directory`.
 *
 * Pattern syntax = Quartz's own `ignorePatterns` syntax (globby / fast-glob
 * `ignore` globs), NOT gitignore. Deliberately: it's the exact mechanism Quartz
 * already uses, and it's case-sensitive and deterministic — gitignore
 * case-folding depends on git's `core.ignorecase`, which we can't rely on in CI.
 * So `.pubignore` holds globby patterns and there are NO special cases in code.
 *
 * Purely path based: no frontmatter, no folder-tree pruning by a folder note's
 * `publish: false`. A tree is withheld only because its path matches a pattern.
 * Per-note `publish: false` / `draft: true` are separate filters
 * (exclude-publish / remove-draft).
 *
 * Covering BOTH markdown and non-markdown, using the ONE globber:
 *   - We append the `.pubignore` patterns to `cfg.configuration.ignorePatterns`.
 *     Quartz's built-in Assets emitter re-globs the content dir with that list
 *     (in the main process, after filtering), so confidential non-markdown
 *     assets are skipped.
 *   - Markdown is parsed before that glob can affect it, so a `shouldPublish`
 *     filter drops ignored markdown. To stay identical to the asset path, the
 *     filter tests membership in the globby result computed from the same
 *     (augmented) ignore list — same globber, same patterns, no drift.
 *
 * Everything runs in the main process (filters and emitters do), so this is
 * robust regardless of Quartz's markdown worker pool.
 */

const PUBIGNORE_FILE = ".pubignore"

interface BuildState {
  /** Relative posix paths that survive `.pubignore` (null when no .pubignore). */
  kept: Set<string> | null
}

// Cached per build so the read + ignorePatterns mutation + glob happen once.
const stateByBuild = new Map<string, BuildState>()

function readPatterns(pubignorePath: string): string[] {
  return fs
    .readFileSync(pubignorePath, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
}

function initForBuild(ctx: BuildCtx): BuildState {
  const key = ctx.buildId
  const cached = stateByBuild.get(key)
  if (cached) return cached

  // Only the active build's state is retained.
  stateByBuild.clear()

  const dir = ctx.argv.directory
  const pubignorePath = path.join(dir, PUBIGNORE_FILE)

  let kept: Set<string> | null = null
  if (fs.existsSync(pubignorePath)) {
    const patterns = ctx.cfg.configuration.ignorePatterns
    const existing = new Set(patterns)
    for (const p of readPatterns(pubignorePath)) {
      if (!existing.has(p)) {
        patterns.push(p)
        existing.add(p)
      }
    }
    // Same globber Quartz uses (globby ignore + gitignore files), so the
    // markdown filter and the Assets emitter agree on what is published.
    kept = new Set(
      globbySync("**", { cwd: dir, ignore: patterns, gitignore: true, dot: true }),
    )
  }

  const state: BuildState = { kept }
  stateByBuild.set(key, state)
  return state
}

export const PubIgnore: QuartzFilterPlugin = () => ({
  name: "PubIgnore",
  shouldPublish(ctx, [, file]) {
    const { kept } = initForBuild(ctx)
    if (!kept) return true
    const rel = file.data?.relativePath as string | undefined
    if (!rel) return true
    return kept.has(rel)
  },
})

export default PubIgnore
