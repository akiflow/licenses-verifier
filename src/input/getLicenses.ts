import { resolve } from 'path'
import { IModuleInfo, IModuleInfos, ILicensesVerifierCliOptions } from '../types'
import { DependencyField, IManifest, parsePerson, parseRepository, readManifest } from '../utils/manifest'
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

  if (onlyProduction) {
    return Array.from(collectReachablePackages(projectDir, projectManifest, productionFields).values())
  }

  if (onlyDevelopment) {
    const productionSet = collectReachablePackages(projectDir, projectManifest, productionFields)
    const developmentSet = collectReachablePackages(projectDir, projectManifest, ['devDependencies'])
    return Array.from(developmentSet.values()).filter(pkg => !productionSet.has(pkg.realDir))
  }

  // Installed packages come first: they are walked breadth first, so the
  // hoisted copy of a duplicated package is the one that gets reported. The
  // manifest walk still runs, to learn which package required which: a package
  // found only in `node_modules` has nothing depending on it.
  const reachableFields: Array<DependencyField> = ['dependencies', 'devDependencies', 'optionalDependencies']
  const reachable = collectReachablePackages(projectDir, projectManifest, reachableFields)
  const seen = new Set(installed.map(pkg => pkg.realDir))
  const selected = installed.map(pkg => {
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
 * Reads the project and every one of its installed dependencies, and returns
 * their license information keyed by `name@version`.
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

  // The project itself is part of the report: its own license is what the
  // whitelist of its dependencies has to be compatible with.
  const all: Array<IInstalledPackage> = []
  if (projectManifest !== null && typeof projectManifest.name === 'string' && projectManifest.name) {
    const version = typeof projectManifest.version === 'string' ? projectManifest.version : '0.0.0'
    all.push({
      key: `${projectManifest.name}@${version}`,
      name: projectManifest.name,
      version,
      dir: projectDir,
      realDir: projectDir,
      manifest: projectManifest
    })
  }
  all.push(...selected)

  const result: IModuleInfos = {}
  for (const pkg of all) {
    // Breadth-first order means the first occurrence is the hoisted one.
    if (!result[pkg.key]) {
      result[pkg.key] = toModuleInfo(pkg)
    }
  }
  return result
}
