import { IManifest } from './manifest'

/**
 * The lists of packages a project can declare in its `package.json`, and the
 * rule that says whether a package is on one of them.
 *
 * Shared by the scan and by the report, so that a package cannot be excluded
 * from one and not from the other.
 */

/** Splits `@scope/name@1.2.3` into its name and its version. */
export function splitPackageKey (key: string): { name: string, version: string } {
  const at = key.lastIndexOf('@')
  return at > 0
    ? { name: key.slice(0, at), version: key.slice(at + 1) }
    : { name: key, version: '' }
}

/** Keeps the strings of a manifest array, ignoring anything else it may hold. */
export function readPackageList (value: unknown): Array<string> {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : []
}

/**
 * True when `packageKey` (`name@version`) is named by the list.
 *
 * An entry with a version accepts that one version, so that a version bump
 * comes back for review. A bare name accepts every version of that package,
 * which is what a project that keeps updating a reviewed dependency needs.
 */
export function listNamesPackage (list: Array<string>, packageKey: string): boolean {
  if (list.length === 0) {
    return false
  }
  return list.includes(packageKey) || list.includes(splitPackageKey(packageKey).name)
}

export interface IProjectPackageLists {
  /** `whitelistedLicenses`, or null when the project declares none. */
  licenses: Array<string> | null
  /** `whitelistedPackages`: accepted whatever their license. */
  whitelisted: Array<string>
  /** `excludedPackages`: left out of the report and of every generated file. */
  excluded: Array<string>
}

export function readPackageLists (manifest: IManifest | null): IProjectPackageLists {
  const licenses = manifest && manifest.whitelistedLicenses
  return {
    licenses: Array.isArray(licenses) ? readPackageList(licenses) : null,
    whitelisted: readPackageList(manifest && manifest.whitelistedPackages),
    excluded: readPackageList(manifest && manifest.excludedPackages)
  }
}
