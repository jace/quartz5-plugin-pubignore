import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import PubIgnore from "../src/index";

// Exercises the confidentiality gate end-to-end: a real temp content dir with a
// `.pubignore`, globbed exactly as the plugin does, asserting which relative
// paths shouldPublish() keeps vs withholds.

const dirs: string[] = [];

function makeDir(files: string[], pubignore?: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pubignore-"));
  dirs.push(dir);
  for (const f of files) {
    const abs = path.join(dir, f);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, "x");
  }
  if (pubignore !== undefined) fs.writeFileSync(path.join(dir, ".pubignore"), pubignore);
  return dir;
}

afterEach(() => {
  while (dirs.length) fs.rmSync(dirs.pop()!, { recursive: true, force: true });
});

let buildCounter = 0;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ctxFor(dir: string, ignorePatterns: string[] = []): any {
  return {
    buildId: `build-${buildCounter++}`, // unique so the per-build cache never collides
    argv: { directory: dir },
    cfg: { configuration: { ignorePatterns } },
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function publishable(filter: any, ctx: any, rel: string): boolean {
  return filter.shouldPublish(ctx, [null, { data: { relativePath: rel } }]);
}

describe("PubIgnore", () => {
  it("publishes everything when there is no .pubignore", () => {
    const dir = makeDir(["a.md", "Private/secret.md"]);
    const filter = PubIgnore();
    const ctx = ctxFor(dir);
    expect(publishable(filter, ctx, "a.md")).toBe(true);
    expect(publishable(filter, ctx, "Private/secret.md")).toBe(true);
  });

  it("withholds paths matching a glob and keeps the rest", () => {
    const dir = makeDir(
      ["public.md", "Private/secret.md", "Private/deep/more.md", "notes/keep.md"],
      "Private\nPrivate/**\n",
    );
    const filter = PubIgnore();
    const ctx = ctxFor(dir);
    expect(publishable(filter, ctx, "public.md")).toBe(true);
    expect(publishable(filter, ctx, "notes/keep.md")).toBe(true);
    expect(publishable(filter, ctx, "Private/secret.md")).toBe(false);
    expect(publishable(filter, ctx, "Private/deep/more.md")).toBe(false);
  });

  it("skips comment and blank lines when reading patterns", () => {
    const dir = makeDir(
      ["keep.md", "drop.md"],
      "# a comment\n\n   \ndrop.md\n#drop.md would be a comment, not a pattern\n",
    );
    const filter = PubIgnore();
    const ctx = ctxFor(dir);
    expect(publishable(filter, ctx, "keep.md")).toBe(true);
    expect(publishable(filter, ctx, "drop.md")).toBe(false);
  });

  it("supports brace/casing patterns like the vault's Templates rule", () => {
    const dir = makeDir(
      ["Templates/t.md", "keep.md"],
      "{Templates,templates,TEMPLATES}\n{Templates,templates,TEMPLATES}/**\n",
    );
    const filter = PubIgnore();
    const ctx = ctxFor(dir);
    expect(publishable(filter, ctx, "Templates/t.md")).toBe(false);
    expect(publishable(filter, ctx, "keep.md")).toBe(true);
  });

  it("withholds dotfiles and dotfolders via the dot glob", () => {
    const dir = makeDir(["keep.md", ".obsidian/app.json"], "**/.*\n**/.*/**\n");
    const filter = PubIgnore();
    const ctx = ctxFor(dir);
    expect(publishable(filter, ctx, "keep.md")).toBe(true);
    expect(publishable(filter, ctx, ".obsidian/app.json")).toBe(false);
  });

  it("appends patterns to cfg ignorePatterns (for the Assets emitter) without duplicating", () => {
    const dir = makeDir(["x.md"], "Private\nPrivate/**\n");
    const ignorePatterns = ["existing"];
    const filter = PubIgnore();
    const ctx = ctxFor(dir, ignorePatterns);
    publishable(filter, ctx, "x.md"); // triggers the one-time init
    expect(ignorePatterns).toContain("existing"); // pre-existing preserved
    expect(ignorePatterns).toContain("Private");
    expect(ignorePatterns).toContain("Private/**");
    expect(ignorePatterns.filter((p) => p === "Private")).toHaveLength(1); // deduped
  });

  it("tolerates an undefined cfg.ignorePatterns (initializes it)", () => {
    const dir = makeDir(["keep.md", "Private/s.md"], "Private\nPrivate/**\n");
    const filter = PubIgnore();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctx: any = {
      buildId: `build-${buildCounter++}`,
      argv: { directory: dir },
      cfg: { configuration: {} }, // no ignorePatterns
    };
    expect(publishable(filter, ctx, "keep.md")).toBe(true);
    expect(publishable(filter, ctx, "Private/s.md")).toBe(false);
    expect(Array.isArray(ctx.cfg.configuration.ignorePatterns)).toBe(true);
  });

  it("defensively publishes a file that has no relativePath", () => {
    const dir = makeDir(["x.md"], "Private\n");
    const filter = PubIgnore();
    const ctx = ctxFor(dir);
    expect(filter.shouldPublish(ctx, [null, { data: {} }])).toBe(true);
  });
});
