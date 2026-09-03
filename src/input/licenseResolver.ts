import { join } from 'path'
import { FsHelpers } from '../utils/fs'
import { IManifest } from '../utils/manifest'
import { identifyLicenseFromText } from './spdx'

export interface IResolvedLicenseFile {
  path: string
  text: string
}

/**
 * Candidate license file names, most authoritative first. Matched
 * case-insensitively because packages ship `LICENSE`, `License`, `licence.md`
 * and everything in between, and because macOS/Windows file systems are
 * case-insensitive while Linux is not.
 */
const LICENSE_FILE_PATTERNS: Array<RegExp> = [
  /^licen[sc]e$/i,
  /^licen[sc]e\.(txt|md|markdown|rst)$/i,
  /^licen[sc]e[-_.].*$/i,
  /^copying$/i,
  /^copying\.(txt|md|markdown)$/i,
  /^unlicen[sc]e$/i
]

const NOTICE_FILE_PATTERNS: Array<RegExp> = [
  /^notice$/i,
  /^notice\.(txt|md|markdown)$/i,
  /^copyrightnotice\.txt$/i,
  /^copyright$/i
]

const README_PATTERN = /^readme(\.(txt|md|markdown|rst))?$/i

function findFirstMatch (dir: string, patterns: Array<RegExp>): string | null {
  const entries = FsHelpers.readDirSafe(dir).filter(entry => !entry.isDirectory)
  for (const pattern of patterns) {
    // Sort so the result does not depend on the order the file system returns.
    const matching = entries.filter(entry => pattern.test(entry.name)).map(entry => entry.name).sort()
    if (matching.length > 0) {
      return matching[0]
    }
  }
  return null
}

/** Locates and reads the license file shipped inside a package directory. */
export function findLicenseFile (dir: string): IResolvedLicenseFile | null {
  const fileName = findFirstMatch(dir, LICENSE_FILE_PATTERNS)
  if (fileName === null) {
    return null
  }
  const path = join(dir, fileName)
  const text = FsHelpers.readFileSafe(path)
  return text === null ? null : { path, text }
}

/** Locates and reads the README, used as a last resort to identify a license. */
export function findReadmeFile (dir: string): IResolvedLicenseFile | null {
  const fileName = findFirstMatch(dir, [README_PATTERN])
  if (fileName === null) {
    return null
  }
  const path = join(dir, fileName)
  const text = FsHelpers.readFileSafe(path)
  return text === null ? null : { path, text }
}

/**
 * Some licenses (Apache-2.0 in particular) require the NOTICE file to be
 * redistributed together with the license itself.
 */
export function findNotice (dir: string): string | null {
  const fileName = findFirstMatch(dir, NOTICE_FILE_PATTERNS)
  if (fileName === null) {
    return null
  }
  return FsHelpers.readFileSafe(join(dir, fileName))
}

function normalizeDeclared (value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed || null
  }
  if (value && typeof value === 'object') {
    const type = (value as { type?: unknown }).type
    if (typeof type === 'string' && type.trim()) {
      return type.trim()
    }
  }
  return null
}

/**
 * Reads the license identifier declared in a manifest.
 *
 * Handles the current `license` field, the deprecated `license: { type }`
 * object, and the even older `licenses: [...]` array, which is turned into an
 * SPDX `OR` expression.
 */
export function declaredLicenseId (manifest: IManifest): string | null {
  const fromLicense = normalizeDeclared(manifest.license)
  if (fromLicense) {
    return fromLicense
  }
  const licenses = manifest.licenses
  if (typeof licenses === 'string') {
    return normalizeDeclared(licenses)
  }
  if (Array.isArray(licenses)) {
    const ids = licenses.map(normalizeDeclared).filter((id): id is string => id !== null)
    if (ids.length === 1) {
      return ids[0]
    }
    if (ids.length > 1) {
      return `(${ids.join(' OR ')})`
    }
  }
  return null
}

export interface IResolvedLicense {
  /** SPDX identifier, with a `*` suffix when it was inferred from a file */
  id: string
  licenseFile?: string
  licenseText?: string
  notice?: string
}

/**
 * Determines the license of an installed package, preferring the identifier
 * declared in `package.json` and falling back to identifying the text of the
 * license file (or, last resort, of the README).
 */
export function resolveLicense (dir: string, manifest: IManifest): IResolvedLicense {
  const licenseFile = findLicenseFile(dir)
  const notice = findNotice(dir)

  let id = declaredLicenseId(manifest)
  let file = licenseFile

  if (id === null && licenseFile) {
    const inferred = identifyLicenseFromText(licenseFile.text)
    if (inferred) {
      id = `${inferred}*`
    }
  }

  if (file === null) {
    // Plenty of packages ship no license file and put the license in the README
    // instead. The README is only accepted when it actually contains the text
    // of a license: a README that merely mentions "MIT" is not a license, and
    // recording it as one fills the report with pages of unrelated prose.
    const readme = findReadmeFile(dir)
    const inferred = readme === null ? null : identifyLicenseFromText(readme.text)
    if (readme !== null && inferred !== null) {
      file = readme
      if (id === null) {
        id = `${inferred}*`
      }
    }
  }

  if (id === null) {
    id = manifest.private === true ? 'UNLICENSED' : 'UNKNOWN'
  }

  return {
    id,
    licenseFile: file ? file.path : undefined,
    licenseText: file ? file.text : undefined,
    notice: notice === null ? undefined : notice
  }
}
