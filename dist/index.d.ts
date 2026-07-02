import type { QuartzFilterPlugin } from "@quartz-community/types"

/**
 * Filter: reads `.pubignore` from the content root and withholds matching paths
 * (markdown via this filter; non-markdown assets by appending the resolved
 * paths to `cfg.configuration.ignorePatterns`). Purely glob/name based —
 * gitignore semantics plus a case-insensitive `Private` name rule. No
 * frontmatter, no folder-tree pruning by `publish: false`.
 */
export declare const PubIgnore: QuartzFilterPlugin
export default PubIgnore
