/**
 * Rendering of the dependency paths that brought a package into the project.
 *
 * A license problem is only actionable once you know why the offending package
 * is installed at all: whether you asked for it, or whether it arrived four
 * levels down under something else.
 */

interface ITreeNode {
  key: string
  children: Map<string, ITreeNode>
}

/** Marks a root that nothing in the project manifest depends on. */
const ORPHAN_SUFFIX = ' (not required by package.json)'

/** Marks a package the tree is about, as opposed to one merely on the way to it. */
const TARGET_SUFFIX = ' ❗'

/**
 * Walks up the parent links to build the chain from the project down to
 * `packageKey`, project first.
 *
 * A dependency graph read off disk can contain a cycle (two packages that
 * depend on each other, or a corrupted manifest), so the walk stops as soon as
 * it revisits a package instead of looping forever.
 */
export function dependencyPath (packageKey: string, parents: Map<string, string>): Array<string> {
  const path = [packageKey]
  const seen = new Set([packageKey])
  let current = packageKey

  for (;;) {
    const parent = parents.get(current)
    if (parent === undefined || seen.has(parent)) {
      return path.reverse()
    }
    seen.add(parent)
    path.push(parent)
    current = parent
  }
}

function insert (roots: Map<string, ITreeNode>, path: Array<string>): void {
  let level = roots
  for (const key of path) {
    let node = level.get(key)
    if (!node) {
      node = { key, children: new Map() }
      level.set(key, node)
    }
    level = node.children
  }
}

function renderChildren (node: ITreeNode, prefix: string, targets: Set<string>, lines: Array<string>): void {
  const children = Array.from(node.children.values())
  children.forEach((child, index) => {
    const isLast = index === children.length - 1
    const suffix = targets.has(child.key) ? TARGET_SUFFIX : ''
    lines.push(`${prefix}${isLast ? '└─ ' : '├─ '}${child.key}${suffix}`)
    renderChildren(child, `${prefix}${isLast ? '   ' : '│  '}`, targets, lines)
  })
}

/**
 * Renders the paths leading to each of `packageKeys` as a single tree, merging
 * the parts they have in common so that a shared culprit is visible at a glance.
 *
 * The packages in `packageKeys` are marked, so that they can be told apart from
 * the ones that only appear because they are on the way to them.
 *
 * Every line is prefixed with `indent`. A package that is neither the project
 * (`projectKey`) nor required by anything becomes a root of its own, marked as
 * such: it sits in `node_modules` while nothing depends on it, which is itself
 * the answer to why it is there.
 */
export function renderDependencyTree (
  packageKeys: Array<string>,
  parents: Map<string, string>,
  indent: string = '',
  projectKey?: string
): Array<string> {
  const roots = new Map<string, ITreeNode>()
  const orphans = new Set<string>()
  const targets = new Set(packageKeys)

  for (const key of Array.from(targets).sort()) {
    const path = dependencyPath(key, parents)
    if (path.length === 1 && key !== projectKey) {
      orphans.add(key)
    }
    insert(roots, path)
  }

  const lines: Array<string> = []
  for (const root of roots.values()) {
    const suffix = orphans.has(root.key) ? ORPHAN_SUFFIX : (targets.has(root.key) ? TARGET_SUFFIX : '')
    lines.push(`${indent}${root.key}${suffix}`)
    renderChildren(root, indent, targets, lines)
  }
  return lines
}
