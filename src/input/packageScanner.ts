import { existsSync, realpathSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { FsHelpers } from '../utils/fs'
import { DependencyField, IManifest, dependencyNames, readManifest } from '../utils/manifest'

export interface IInstalledPackage {
  /** `name@version` */
  key: string
  name: string
  version: string
  /** Absolute path of the package directory */
  dir: string
  /** Canonical path, used to identify a package across symlinked layouts */
  realDir: string
  manifest: IManifest
  /**
   * `name@version` of the package that required this one. Only set by
   * `collectReachablePackages`, which is the walk that knows who depends on
   * whom; the breadth first `node_modules` scan does not.
   */
  requiredBy?: string
}

/** Canonicalises a path, tolerating broken symlinks and missing directories. */
function canonical (path: string): string {
  try {
    return realpathSync.native(path)
  } catch {
    return resolve(path)
  }
}

function hasManifest (dir: string): boolean {
  return existsSync(join(dir, 'package.json'))
}

/**
 * Walks the `node_modules` tree of a project and returns every installed
 * package, breadth first so that hoisted (shallower) copies win over nested
 * duplicates of the same `name@version`.
 *
 * Handles scoped packages (`@scope/name`), nested `node_modules`, and symlinked
 * layouts such as the ones produced by pnpm or `npm link` — following symlinks
 * while keeping track of canonical paths, so cycles cannot loop forever.
 */
export function collectInstalledPackages (projectDir: string): Array<IInstalledPackage> {
  const packages: Array<IInstalledPackage> = []
  const seenPackageDirs = new Set<string>()
  const seenModuleDirs = new Set<string>()
  const queue: Array<string> = [join(projectDir, 'node_modules')]

  const enqueuePackage = (packageDir: string): void => {
    const realDir = canonical(packageDir)
    if (seenPackageDirs.has(realDir)) {
      return
    }
    const manifest = readManifest(packageDir)
    if (manifest === null || typeof manifest.name !== 'string' || !manifest.name) {
      return
    }
    seenPackageDirs.add(realDir)
    const version = typeof manifest.version === 'string' ? manifest.version : '0.0.0'
    packages.push({
      key: `${manifest.name}@${version}`,
      name: manifest.name,
      version,
      dir: packageDir,
      realDir,
      manifest
    })
    queue.push(join(packageDir, 'node_modules'))
  }

  while (queue.length > 0) {
    const modulesDir = queue.shift() as string
    const realModulesDir = canonical(modulesDir)
    if (seenModuleDirs.has(realModulesDir)) {
      continue
    }
    seenModuleDirs.add(realModulesDir)

    for (const entry of FsHelpers.readDirSafe(modulesDir)) {
      // `.bin`, `.package-lock.json`, `.pnpm`, `.cache`, … are not packages.
      if (entry.name.startsWith('.')) {
        continue
      }
      const entryPath = join(modulesDir, entry.name)
      if (entry.name.startsWith('@')) {
        // A scope directory holds the actual packages one level deeper.
        for (const scoped of FsHelpers.readDirSafe(entryPath)) {
          if (scoped.name.startsWith('.')) {
            continue
          }
          enqueuePackage(join(entryPath, scoped.name))
        }
        continue
      }
      if (!entry.isDirectory && !entry.isSymbolicLink) {
        continue
      }
      enqueuePackage(entryPath)
    }
  }

  return packages
}

/**
 * Resolves a dependency the way Node does: look in `node_modules` of the
 * requiring directory, then of each ancestor directory. This is what makes the
 * result correct for hoisted installs and for monorepos where dependencies live
 * in the workspace root.
 */
export function resolveDependencyDir (fromDir: string, dependencyName: string): string | null {
  let current = resolve(fromDir)
  for (;;) {
    const candidate = join(current, 'node_modules', dependencyName)
    if (hasManifest(candidate)) {
      return candidate
    }
    const parent = dirname(current)
    if (parent === current) {
      return null
    }
    current = parent
  }
}

/**
 * Returns every package reachable from the given dependency fields of the
 * project manifest, mapped by canonical path.
 *
 * Resolution follows Node's own algorithm, so this finds dependencies wherever
 * they were actually installed: in the project, hoisted to a workspace root, or
 * in a pnpm store behind symlinks.
 *
 * Transitive dependencies are followed through `dependencies` and
 * `optionalDependencies` only: `devDependencies` of a dependency are not
 * installed, and `peerDependencies` are satisfied by whoever depends on them.
 *
 * `isExcluded` prunes the walk: a package it names is left out and is not
 * walked into, so its own dependencies are only reached if something else
 * depends on them too.
 */
export function collectReachablePackages (
  projectDir: string,
  projectManifest: IManifest | null,
  rootFields: Array<DependencyField>,
  isExcluded: (packageKey: string) => boolean = () => false
): Map<string, IInstalledPackage> {
  const reachable = new Map<string, IInstalledPackage>()
  const transitiveFields: Array<DependencyField> = ['dependencies', 'optionalDependencies']
  const projectKey = projectManifest && typeof projectManifest.name === 'string' && projectManifest.name
    ? `${projectManifest.name}@${typeof projectManifest.version === 'string' ? projectManifest.version : '0.0.0'}`
    : undefined
  const queue: Array<{ dir: string, names: Array<string>, requiredBy?: string }> = [
    { dir: projectDir, names: dependencyNames(projectManifest, rootFields), requiredBy: projectKey }
  ]

  // Breadth first, so the recorded parent is the one on the shortest path from
  // the project: that is the answer to "why is this package here?".
  while (queue.length > 0) {
    const { dir, names, requiredBy } = queue.shift() as { dir: string, names: Array<string>, requiredBy?: string }
    for (const name of names) {
      const dependencyDir = resolveDependencyDir(dir, name)
      if (dependencyDir === null) {
        continue
      }
      const realDir = canonical(dependencyDir)
      if (reachable.has(realDir)) {
        continue
      }
      const manifest = readManifest(dependencyDir)
      if (manifest === null || typeof manifest.name !== 'string' || !manifest.name) {
        continue
      }
      const version = typeof manifest.version === 'string' ? manifest.version : '0.0.0'
      const key = `${manifest.name}@${version}`
      if (isExcluded(key)) {
        continue
      }
      reachable.set(realDir, {
        key,
        name: manifest.name,
        version,
        dir: dependencyDir,
        realDir,
        manifest,
        // A package that depends on itself is its own parent, which says
        // nothing and would render as a loop.
        requiredBy: requiredBy === key ? undefined : requiredBy
      })
      queue.push({ dir: dependencyDir, names: dependencyNames(manifest, transitiveFields), requiredBy: key })
    }
  }

  return reachable
}
