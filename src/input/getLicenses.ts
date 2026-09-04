import { resolve } from 'path'
import { IModuleInfo, IModuleInfos, ILicensesVerifierCliOptions } from '../types'
import { DependencyField, IManifest, parsePerson, parseRepository, readManifest } from '../utils/manifest'
import { listNamesPackage, readPackageLists } from '../utils/packageLists'
import { IInstalledPackage, collectInstalledPackages, collectReachablePackages } from './packageScanner'
import { resolveLicense } from './licenseResolver'

/**
 * Selects which packages must be reported, according to the `--production` /
 * `--development` flags.
 *
 * - neither flag: every package installed under the project, plus everything
 *   reachable from its manifest. The union is deliberate: a package installed
 *   but no longer depended upon still sits in `node_modules`, and a dependency
 *   hoisted to a workspace root is not under the project at all. Reporting a
 *   package too many is recoverable, missing one is not.
 * - `--production`: only what is reachable from `dependencies` /
 *   `optionalDependencies`.
 * - `--development`: only what is reachable from `devDependencies` and *not*
 *   from the production dependencies.
 *
 * Whatever the flags, a package named by `excludedPackages` is left out, and so
 * is everything that was only reachable through it.
 */
function selectPackages (
  projectDir: string,
  projectManifest: IManifest | null,
  installed: Array<IInstalledPackage>,
  args: ILicensesVerifierCliOptions
): Array<IInstalledPackage> {
  const onlyProduction = !!args.production && !args.development
  const onlyDevelopment = !!args.development && !args.production
  const productionFields: Array<DependencyField> = ['dependencies', 'optionalDependencies']
  const excluded = readPackageLists(projectManifest).excluded
  const isExcluded = (packageKey: string): boolean => listNamesPackage(excluded, packageKey)

  if (onlyProduction) {
    return Array.from(collectReachablePackages(projectDir, projectManifest, productionFields, isExcluded).values())
  }

  if (onlyDevelopment) {
    const productionSet = collectReachablePackages(projectDir, projectManifest, productionFields, isExcluded)
    const developmentSet = collectReachablePackages(projectDir, projectManifest, ['devDependencies'], isExcluded)
    return Array.from(developmentSet.values()).filter(pkg => !productionSet.has(pkg.realDir))
  }

  // Installed packages come first: they are walked breadth first, so the
  // hoisted copy of a duplicated package is the one that gets reported. The
  // manifest walk still runs, to learn which package required which: a package
  // found only in `node_modules` has nothing depending on it.
  const reachableFields: Array<DependencyField> = ['dependencies', 'devDependencies', 'optionalDependencies']
  const reachable = collectReachablePackages(projectDir, projectManifest, reachableFields, isExcluded)

  // Scanning `node_modules` finds the excluded subtree too, so an installed
  // package is dropped when it is excluded itself, or when the manifest could
  // only reach it through something excluded. One that the manifest never
  // reached at all is kept: nothing claims it, so nothing can disown it either.
  const reachedWithoutExclusions = excluded.length === 0
    ? reachable
    : collectReachablePackages(projectDir, projectManifest, reachableFields)
  const keptInstalled = installed.filter(pkg => (
    !isExcluded(pkg.key) && (reachable.has(pkg.realDir) || !reachedWithoutExclusions.has(pkg.realDir))
  ))

  const seen = new Set(keptInstalled.map(pkg => pkg.realDir))
  const selected = keptInstalled.map(pkg => {
    const viaManifest = reachable.get(pkg.realDir)
    return viaManifest ? { ...pkg, requiredBy: viaManifest.requiredBy } : pkg
  })
  for (const pkg of reachable.values()) {
    if (!seen.has(pkg.realDir)) {
      seen.add(pkg.realDir)
      selected.push(pkg)
    }
  }
  return selected
}

function toModuleInfo (pkg: IInstalledPackage): IModuleInfo {
  const { manifest } = pkg
  const license = resolveLicense(pkg.dir, manifest)
  const person = parsePerson(manifest.author)

  const info: IModuleInfo = {
    name: pkg.key,
    licenses: license.id,
    license: license.licenseText || ''
  }

  const repository = parseRepository(manifest)
  if (repository) {
    info.repository = repository
  }
  if (person.name) {
    info.publisher = person.name
  }
  if (person.email) {
    info.email = person.email
  }
  if (person.url) {
    info.url = person.url
  }
  if (license.notice) {
    info.notice = license.notice
  }
  if (manifest.private === true) {
    info.private = true
  }
  if (license.licenseFile) {
    info.licenseFile = license.licenseFile
  }
  if (pkg.requiredBy) {
    info.requiredBy = pkg.requiredBy
  }
  info.path = pkg.dir

  return info
}

/**
 * True when a package was put there by a package manager, i.e. when it lives
 * inside a `node_modules` directory.
 *
 * Everything fetched from a registry does, whichever package manager installed
 * it. What does not is the project's own source: itself, and the packages of
 * its workspaces, which every package manager materialises as a symlink out of
 * `node_modules` and back into the repository. Those are code you wrote, not a
 * third party license to review, so they have no place in the report.
 */
function isInstalledDependency (realDir: string): boolean {
  return realDir.split(/[\\/]/).includes('node_modules')
}

/**
 * Reads the installed dependencies of a project and returns their license
 * information keyed by `name@version`.
 *
 * The project itself and its workspace packages are left out: the question this
 * answers is what third party code the project carries, and your own code is
 * not part of the answer.
 *
 * Returns null when the given directory holds no project and no packages, so
 * that the caller can tell the user the path is probably wrong.
 */
export function getLicenses (args: ILicensesVerifierCliOptions): IModuleInfos | null {
  const projectDir = resolve(process.cwd(), args.projectPath)
  const projectManifest = readManifest(projectDir)
  const installed = collectInstalledPackages(projectDir)

  const selected = selectPackages(projectDir, projectManifest, installed, args)

  if (projectManifest === null && selected.length === 0) {
    return null
  }

  const result: IModuleInfos = {}
  for (const pkg of selected) {
    if (!isInstalledDependency(pkg.realDir)) {
      continue
    }
    // Breadth-first order means the first occurrence is the hoisted one.
    if (!result[pkg.key]) {
      result[pkg.key] = toModuleInfo(pkg)
    }
  }
  return result
}
