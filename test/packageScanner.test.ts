import { describe, expect, test } from 'bun:test'
import { mkdirSync, symlinkSync, writeFileSync } from 'fs'
import { join, parse } from 'path'
import {
  collectInstalledPackages,
  collectReachablePackages,
  resolveDependencyDir
} from '../src/input/packageScanner'
import { readManifest } from '../src/utils/manifest'
import * as h from './helpers'

const keys = (packages: Array<{ key: string }>) => packages.map(p => p.key).sort()
const reachableKeys = (map: Map<string, { key: string }>) => Array.from(map.values()).map(p => p.key).sort()

describe('collectInstalledPackages', () => {
  test('finds plain and scoped packages', () => {
    h.withTempDir(dir => {
      h.writeProject(dir, { name: 'root', version: '1.0.0' })
      h.writePackage(dir, 'plain', { version: '1.2.3' })
      h.writePackage(dir, '@scope/scoped', { version: '2.0.0' })
      h.writePackage(dir, '@other/thing', { version: '3.0.0' })
      expect(keys(collectInstalledPackages(dir))).toEqual([
        '@other/thing@3.0.0', '@scope/scoped@2.0.0', 'plain@1.2.3'
      ])
    })
  })

  test('finds packages in nested node_modules, at any depth', () => {
    h.withTempDir(dir => {
      h.writeProject(dir, { name: 'root', version: '1.0.0' })
      const outer = h.writePackage(dir, 'outer')
      const inner = h.writePackage(outer, 'inner', { version: '0.1.0' })
      h.writePackage(inner, 'innermost', { version: '0.0.1' })
      expect(keys(collectInstalledPackages(dir))).toEqual([
        'inner@0.1.0', 'innermost@0.0.1', 'outer@1.0.0'
      ])
    })
  })

  test('walks breadth first, so the hoisted copy comes first', () => {
    h.withTempDir(dir => {
      h.writeProject(dir, { name: 'root', version: '1.0.0' })
      const outer = h.writePackage(dir, 'outer')
      h.writePackage(outer, 'deep', { version: '1.0.0' })
      h.writePackage(dir, 'shallow', { version: '1.0.0' })

      const found = collectInstalledPackages(dir).map(p => p.key)
      expect(found.indexOf('shallow@1.0.0')).toBeLessThan(found.indexOf('deep@1.0.0'))
    })
  })

  test('ignores dot directories, loose files and directories without a manifest', () => {
    h.withTempDir(dir => {
      h.writeProject(dir, { name: 'root', version: '1.0.0' })
      h.writePackage(dir, 'real')
      const modules = join(dir, 'node_modules')
      mkdirSync(join(modules, '.bin'), { recursive: true })
      mkdirSync(join(modules, '.pnpm'), { recursive: true })
      mkdirSync(join(modules, 'no-manifest'), { recursive: true })
      writeFileSync(join(modules, '.package-lock.json'), '{}')
      writeFileSync(join(modules, 'loose-file.js'), '')
      expect(keys(collectInstalledPackages(dir))).toEqual(['real@1.0.0'])
    })
  })

  test('ignores dot directories inside a scope', () => {
    h.withTempDir(dir => {
      h.writeProject(dir, { name: 'root', version: '1.0.0' })
      h.writePackage(dir, '@scope/real')
      mkdirSync(join(dir, 'node_modules', '@scope', '.cache'), { recursive: true })
      expect(keys(collectInstalledPackages(dir))).toEqual(['@scope/real@1.0.0'])
    })
  })

  test('skips a package with no name, and defaults a missing version', () => {
    h.withTempDir(dir => {
      h.writeProject(dir, { name: 'root', version: '1.0.0' })
      const nameless = join(dir, 'node_modules', 'nameless')
      mkdirSync(nameless, { recursive: true })
      writeFileSync(join(nameless, 'package.json'), JSON.stringify({ version: '1.0.0' }))
      const versionless = join(dir, 'node_modules', 'versionless')
      mkdirSync(versionless, { recursive: true })
      writeFileSync(join(versionless, 'package.json'), JSON.stringify({ name: 'versionless' }))
      expect(keys(collectInstalledPackages(dir))).toEqual(['versionless@0.0.0'])
    })
  })

  test('tolerates an invalid package.json', () => {
    h.withTempDir(dir => {
      h.writeProject(dir, { name: 'root', version: '1.0.0' })
      h.writePackage(dir, 'good')
      const broken = join(dir, 'node_modules', 'broken')
      mkdirSync(broken, { recursive: true })
      writeFileSync(join(broken, 'package.json'), '{ this is not json')
      expect(keys(collectInstalledPackages(dir))).toEqual(['good@1.0.0'])
    })
  })

  test('returns an empty list when there is no node_modules', () => {
    h.withTempDir(dir => {
      h.writeProject(dir, { name: 'root', version: '1.0.0' })
      expect(collectInstalledPackages(dir)).toEqual([])
      expect(collectInstalledPackages(join(dir, 'missing'))).toEqual([])
    })
  })

  test('follows a symlinked package, as a pnpm or npm link layout has', () => {
    h.withTempDir(dir => {
      h.writeProject(dir, { name: 'root', version: '1.0.0' })
      const real = h.writeBarePackage(join(dir, 'store', 'linked'), { name: 'linked', version: '3.0.0' }, { LICENSE: h.MIT_TEXT })
      mkdirSync(join(dir, 'node_modules'), { recursive: true })
      symlinkSync(real, join(dir, 'node_modules', 'linked'), 'junction')

      const found = collectInstalledPackages(dir)
      expect(keys(found)).toEqual(['linked@3.0.0'])
    })
  })

  test('reports a symlink cycle once instead of looping forever', () => {
    h.withTempDir(dir => {
      h.writeProject(dir, { name: 'root', version: '1.0.0' })
      const real = h.writeBarePackage(join(dir, 'store', 'linked'), { name: 'linked', version: '3.0.0' })
      mkdirSync(join(dir, 'node_modules'), { recursive: true })
      symlinkSync(real, join(dir, 'node_modules', 'linked'), 'junction')
      // The package links back to itself through its own node_modules.
      mkdirSync(join(real, 'node_modules'), { recursive: true })
      symlinkSync(real, join(real, 'node_modules', 'self'), 'junction')

      expect(keys(collectInstalledPackages(dir))).toEqual(['linked@3.0.0'])
    })
  })

  test('reports the same package installed twice at different paths once', () => {
    h.withTempDir(dir => {
      h.writeProject(dir, { name: 'root', version: '1.0.0' })
      h.writePackage(dir, 'dup', { version: '1.0.0' }, { LICENSE: h.MIT_TEXT })
      const outer = h.writePackage(dir, 'outer')
      h.writePackage(outer, 'dup', { version: '1.0.0' }, { LICENSE: h.ISC_TEXT })

      const found = collectInstalledPackages(dir)
      // Two distinct directories, so both are found; deduplication by
      // `name@version` happens when the report is assembled.
      expect(found.filter(p => p.key === 'dup@1.0.0')).toHaveLength(2)
    })
  })

  test('tolerates a broken symlink', () => {
    h.withTempDir(dir => {
      h.writeProject(dir, { name: 'root', version: '1.0.0' })
      h.writePackage(dir, 'real')
      symlinkSync(join(dir, 'gone'), join(dir, 'node_modules', 'dangling'), 'junction')
      expect(keys(collectInstalledPackages(dir))).toEqual(['real@1.0.0'])
    })
  })
})

describe('resolveDependencyDir', () => {
  test('finds a dependency in the requiring directory', () => {
    h.withTempDir(dir => {
      const consumer = h.writeBarePackage(join(dir, 'consumer'), { name: 'consumer' })
      h.writePackage(consumer, 'own')
      expect(resolveDependencyDir(consumer, 'own')).toBe(join(consumer, 'node_modules', 'own'))
    })
  })

  test('walks up to an ancestor node_modules, as Node does', () => {
    h.withTempDir(dir => {
      h.writeProject(dir, { name: 'root', version: '1.0.0' })
      h.writePackage(dir, 'hoisted')
      const consumer = h.writePackage(dir, 'consumer')
      expect(resolveDependencyDir(consumer, 'hoisted')).toBe(join(dir, 'node_modules', 'hoisted'))
    })
  })

  test('prefers the nearest copy', () => {
    h.withTempDir(dir => {
      h.writeProject(dir, { name: 'root', version: '1.0.0' })
      h.writePackage(dir, 'dep', { version: '1.0.0' })
      const consumer = h.writePackage(dir, 'consumer')
      h.writePackage(consumer, 'dep', { version: '2.0.0' })
      const resolved = resolveDependencyDir(consumer, 'dep') as string
      expect(readManifest(resolved)?.version).toBe('2.0.0')
    })
  })

  test('resolves a scoped dependency', () => {
    h.withTempDir(dir => {
      h.writeProject(dir, { name: 'root', version: '1.0.0' })
      h.writePackage(dir, '@scope/dep')
      expect(resolveDependencyDir(dir, '@scope/dep')).toBe(join(dir, 'node_modules', '@scope/dep'))
    })
  })

  test('returns null and stops at the file system root when nothing matches', () => {
    h.withTempDir(dir => {
      expect(resolveDependencyDir(dir, 'definitely-not-installed-anywhere-xyz')).toBeNull()
      expect(resolveDependencyDir(parse(dir).root, 'definitely-not-installed-anywhere-xyz')).toBeNull()
    })
  })

  test('ignores a directory with no package.json', () => {
    h.withTempDir(dir => {
      mkdirSync(join(dir, 'node_modules', 'empty'), { recursive: true })
      expect(resolveDependencyDir(dir, 'empty')).toBeNull()
    })
  })
})

describe('collectReachablePackages', () => {
  test('follows dependencies transitively', () => {
    h.withTempDir(dir => {
      const manifest = { name: 'root', version: '1.0.0', dependencies: { a: '1' } }
      h.writeProject(dir, manifest)
      h.writePackage(dir, 'a', { dependencies: { b: '1' } })
      h.writePackage(dir, 'b', { dependencies: { c: '1' } })
      h.writePackage(dir, 'c')
      h.writePackage(dir, 'unreferenced')
      expect(reachableKeys(collectReachablePackages(dir, manifest, ['dependencies']))).toEqual([
        'a@1.0.0', 'b@1.0.0', 'c@1.0.0'
      ])
    })
  })

  test('follows optionalDependencies transitively but not devDependencies', () => {
    h.withTempDir(dir => {
      const manifest = { name: 'root', version: '1.0.0', dependencies: { a: '1' } }
      h.writeProject(dir, manifest)
      h.writePackage(dir, 'a', { optionalDependencies: { opt: '1' }, devDependencies: { theirDev: '1' } })
      h.writePackage(dir, 'opt')
      h.writePackage(dir, 'theirDev')
      expect(reachableKeys(collectReachablePackages(dir, manifest, ['dependencies']))).toEqual([
        'a@1.0.0', 'opt@1.0.0'
      ])
    })
  })

  test('does not follow peerDependencies of a dependency', () => {
    h.withTempDir(dir => {
      const manifest = { name: 'root', version: '1.0.0', dependencies: { a: '1' } }
      h.writeProject(dir, manifest)
      h.writePackage(dir, 'a', { peerDependencies: { peer: '1' } })
      h.writePackage(dir, 'peer')
      expect(reachableKeys(collectReachablePackages(dir, manifest, ['dependencies']))).toEqual(['a@1.0.0'])
    })
  })

  test('starts from whichever root fields are asked for', () => {
    h.withTempDir(dir => {
      const manifest = {
        name: 'root',
        version: '1.0.0',
        dependencies: { prod: '1' },
        devDependencies: { dev: '1' },
        optionalDependencies: { opt: '1' }
      }
      h.writeProject(dir, manifest)
      h.writePackage(dir, 'prod')
      h.writePackage(dir, 'dev')
      h.writePackage(dir, 'opt')
      expect(reachableKeys(collectReachablePackages(dir, manifest, ['devDependencies']))).toEqual(['dev@1.0.0'])
      expect(reachableKeys(collectReachablePackages(dir, manifest, ['dependencies', 'optionalDependencies']))).toEqual([
        'opt@1.0.0', 'prod@1.0.0'
      ])
    })
  })

  test('survives a dependency cycle', () => {
    h.withTempDir(dir => {
      const manifest = { name: 'root', version: '1.0.0', dependencies: { a: '1' } }
      h.writeProject(dir, manifest)
      h.writePackage(dir, 'a', { dependencies: { b: '1' } })
      h.writePackage(dir, 'b', { dependencies: { a: '1' } })
      expect(reachableKeys(collectReachablePackages(dir, manifest, ['dependencies']))).toEqual(['a@1.0.0', 'b@1.0.0'])
    })
  })

  test('skips a declared dependency that is not installed', () => {
    h.withTempDir(dir => {
      const manifest = { name: 'root', version: '1.0.0', dependencies: { installed: '1', missing: '1' } }
      h.writeProject(dir, manifest)
      h.writePackage(dir, 'installed')
      expect(reachableKeys(collectReachablePackages(dir, manifest, ['dependencies']))).toEqual(['installed@1.0.0'])
    })
  })

  test('skips an installed dependency whose manifest is unusable', () => {
    h.withTempDir(dir => {
      const manifest = { name: 'root', version: '1.0.0', dependencies: { broken: '1', nameless: '1' } }
      h.writeProject(dir, manifest)
      const broken = join(dir, 'node_modules', 'broken')
      mkdirSync(broken, { recursive: true })
      writeFileSync(join(broken, 'package.json'), 'not json')
      const nameless = join(dir, 'node_modules', 'nameless')
      mkdirSync(nameless, { recursive: true })
      writeFileSync(join(nameless, 'package.json'), '{"version":"1.0.0"}')
      expect(reachableKeys(collectReachablePackages(dir, manifest, ['dependencies']))).toEqual([])
    })
  })

  test('returns an empty map for a null manifest', () => {
    h.withTempDir(dir => {
      expect(collectReachablePackages(dir, null, ['dependencies']).size).toBe(0)
    })
  })

  test('finds a dependency hoisted to a workspace root', () => {
    h.withTempDir(dir => {
      // The workspace root holds node_modules; the package lives two levels down.
      h.writeProject(dir, { name: 'mono', version: '1.0.0', private: true })
      h.writePackage(dir, 'hoisted', { version: '4.0.0' })
      const app = join(dir, 'packages', 'app')
      const appManifest = { name: 'app', version: '1.0.0', dependencies: { hoisted: '4' } }
      h.writeProject(app, appManifest)
      expect(reachableKeys(collectReachablePackages(app, appManifest, ['dependencies']))).toEqual(['hoisted@4.0.0'])
    })
  })
})
