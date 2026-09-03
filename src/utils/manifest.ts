import { join } from 'path'
import { FsHelpers } from './fs'

export interface IPersonObject {
  name?: string
  email?: string
  url?: string
}

export interface IManifest {
  name?: string
  version?: string
  private?: boolean
  license?: string | { type?: string, url?: string }
  licenses?: Array<string | { type?: string, url?: string }> | string
  author?: string | IPersonObject
  repository?: string | { url?: string, type?: string, directory?: string }
  homepage?: string
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  whitelistedLicenses?: Array<string>
}

export type DependencyField = 'dependencies' | 'devDependencies' | 'optionalDependencies' | 'peerDependencies'

/** Reads and parses `<dir>/package.json`. Returns null when absent or invalid. */
export function readManifest (dir: string): IManifest | null {
  const raw = FsHelpers.readFileSafe(join(dir, 'package.json'))
  if (raw === null) {
    return null
  }
  try {
    const parsed = JSON.parse(raw)
    // A JSON file can legitimately hold an array or a string; we need an object.
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null
    }
    return parsed as IManifest
  } catch {
    return null
  }
}

/** Collects the dependency names declared in the given manifest fields. */
export function dependencyNames (manifest: IManifest | null, fields: Array<DependencyField>): Array<string> {
  if (!manifest) {
    return []
  }
  const names: Array<string> = []
  for (const field of fields) {
    const deps = manifest[field]
    if (deps && typeof deps === 'object') {
      for (const name of Object.keys(deps)) {
        if (!names.includes(name)) {
          names.push(name)
        }
      }
    }
  }
  return names
}

/**
 * Normalizes the `author` field, which npm allows both as an object and as the
 * shorthand string `Name <email> (url)`.
 */
export function parsePerson (author: string | IPersonObject | undefined): IPersonObject {
  if (!author) {
    return {}
  }
  if (typeof author === 'object') {
    return {
      name: typeof author.name === 'string' ? author.name : undefined,
      email: typeof author.email === 'string' ? author.email : undefined,
      url: typeof author.url === 'string' ? author.url : undefined
    }
  }
  if (typeof author !== 'string') {
    return {}
  }
  const email = /<([^>]+)>/.exec(author)
  const url = /\(([^)]+)\)/.exec(author)
  const name = author
    .replace(/<[^>]*>/, '')
    .replace(/\([^)]*\)/, '')
    .trim()
  return {
    name: name || undefined,
    email: email ? email[1].trim() : undefined,
    url: url ? url[1].trim() : undefined
  }
}

/** Normalizes the `repository` field to a plain https URL when possible. */
export function parseRepository (manifest: IManifest): string | undefined {
  const repository = manifest.repository
  let url: string | undefined
  if (typeof repository === 'string') {
    url = repository
  } else if (repository && typeof repository === 'object' && typeof repository.url === 'string') {
    url = repository.url
  }
  if (!url) {
    return typeof manifest.homepage === 'string' ? manifest.homepage : undefined
  }
  // Shorthands accepted by npm: `user/repo`, `github:user/repo`, `gitlab:...`
  const shorthand = /^(?:(github|gitlab|bitbucket):)?([\w.-]+\/[\w.-]+)$/.exec(url)
  if (shorthand) {
    const hosts: Record<string, string> = {
      github: 'github.com',
      gitlab: 'gitlab.com',
      bitbucket: 'bitbucket.org'
    }
    return `https://${hosts[shorthand[1] || 'github']}/${shorthand[2]}`
  }
  // Normalize every git transport to plain https, so that the reported URL can
  // be opened in a browser by whoever reviews the report.
  return url
    .replace(/^git\+/, '')
    .replace(/^git@([^:/]+)[:/]/, 'https://$1/')
    .replace(/^(?:git|ssh|http):\/\/(?:git@)?/, 'https://')
    .replace(/^https:\/\/git@/, 'https://')
    .replace(/\.git(?:#.*)?$/, '')
}
