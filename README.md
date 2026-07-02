# quartz5-plugin-pubignore

A [Quartz v5](https://quartz.jzhao.xyz/) confidentiality filter that reads a
**`.pubignore`** file from the content root and withholds matching paths — both
markdown pages and non-markdown assets — from the build.

It exists for the common setup where your **content lives in a different repo
from your Quartz config**. The ignore list must travel atomically with the
content it governs; keeping a copy in `quartz.config.yaml` (often a separate,
public repo) is a drift-prone leak risk. `.pubignore` is the single source of
truth, read at build time from the content directory.

## `.pubignore`

Patterns use **Quartz's own `ignorePatterns` syntax** (globby / fast-glob
`ignore` globs) — the same mechanism Quartz already globs with. This is
deliberately **not** gitignore syntax: it is case-sensitive and deterministic,
whereas gitignore case-folding depends on git's `core.ignorecase` (which you
can't rely on in CI). Note globby globs are not recursive by default, so match
directory subtrees with `dir/**` and use `**/` to match at any depth.

```
# Dotfiles/dotfolders anywhere (and their contents)
**/.*
**/.*/**
# Obsidian-only formats, anywhere
**/*.base
**/*.canvas
# "Private" by name, anywhere (and contents)
**/Private
**/Private/**
**/Private-*
**/Private-*/**
# Scaffolding and root repo docs/config
Templates
Templates/**
README.md
```

## What it enforces

It **purely applies the `.pubignore` globby patterns** — no special cases in
code. It does **not** read frontmatter and does **not** prune a folder tree by a
folder note's `publish: false`; a tree is withheld only because its path matches
a pattern. Per-note `publish: false` / `draft: true` are separate concerns (see
`exclude-publish` / `remove-draft`).

## How it covers markdown *and* assets

Using the one globber, so both paths agree:

- The plugin appends the `.pubignore` patterns to
  `cfg.configuration.ignorePatterns`. Quartz's built-in **Assets** emitter
  re-globs the content dir with that list (in the main process, after
  filtering), so confidential **non-markdown** assets are skipped.
- **Markdown** is parsed before that glob can affect it, so a `shouldPublish`
  filter drops ignored markdown — testing membership in the globby result
  computed from the same augmented ignore list. Same globber, same patterns, no
  drift.

Everything runs in the main process, so it is robust regardless of Quartz's
markdown worker pool.

## Install

```bash
npx quartz plugin add github:jace/quartz5-plugin-pubignore
```

```yaml
plugins:
  - source: github:jace/quartz5-plugin-pubignore
    enabled: true
```

Put a `.pubignore` in your content root. That's it.

## Packaging

`dist/` is committed hand-written plain ESM. Quartz installs git/local plugin
sources by cloning and imports `dist/index.js` at runtime with no build step.
The only non-builtin import is `globby`, which is a Quartz dependency (a shared
external), so it resolves from the host and needs no bundling. Source is in
`src/index.ts`; keep the two in sync.

## License

MIT © Kiran Jonnalagadda
