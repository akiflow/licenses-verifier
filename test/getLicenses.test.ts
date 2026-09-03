import { describe, expect, test } from 'bun:test'
import { join } from 'path'
import { getLicenses } from '../src/input/getLicenses'
import type { ILicensesVerifierCliOptions } from '../src/types'
import * as h from './helpers'

function collect (projectPath: string, options: Partial<ILicensesVerifierCliOptions> = {}) {
  return getLicenses({ projectPath, ...options })
}

const sortedKeys = (packages: object | null) => Object.keys(packages ?? {}).sort()

describe('getLicenses', () => {
  test('returns null when the directory holds no project and no packages', () => {
    h.withTempDir(dir => {
      expect(collect(dir)).toBeNull()
      expect(collect(join(dir, 'missing'))).toBeNull()
    })
  })

  test('reports a project with no dependencies', () => {
    h.withTempDir(dir => {
      h.writeProject(dir, { name: 'solo', version: '2.1.0', license: 'MIT' })
      expect(sortedKeys(collect(dir))).toEqual(['solo@2.1.0'])
    })
  })

  test('reports packages even when the project has no manifest', () => {
    h.withTempDir(dir => {
      h.writePackage(dir, 'orphan', { license: 'MIT' })
      expect(sortedKeys(collect(dir))).toEqual(['orphan@1.0.0'])
    })
  })

  test('defaults a project with no version', () => {
    h.withTempDir(dir => {
      h.writeProject(dir, { name: 'unversioned', license: 'MIT' })
      expect(sortedKeys(collect(dir))).toEqual(['unversioned@0.0.0'])
    })
  })

  test('omits a project with no name', () => {
    h.withTempDir(dir => {
      h.writeProject(dir, { version: '1.0.0', license: 'MIT' })
      h.writePackage(dir, 'dep', { license: 'MIT' })
      expect(sortedKeys(collect(dir))).toEqual(['dep@1.0.0'])
    })
  })

  describe('selection', () => {
    /** A project with one production, one dev, one optional and one extraneous package. */
    function fixture (dir: string) {
      h.writeProject(dir, {
        name: 'root',
        version: '1.0.0',
        license: 'MIT',
        dependencies: { prod: '1' },
        devDependencies: { dev: '1' },
        optionalDependencies: { opt: '1' }
      })
      h.writePackage(dir, 'prod', { license: 'MIT', dependencies: { transitive: '1' } })
      h.writePackage(dir, 'transitive', { license: 'MIT' })
      h.writePackage(dir, 'dev', { license: 'MIT' })
      h.writePackage(dir, 'opt', { license: 'MIT' })
      h.writePackage(dir, 'extraneous', { license: 'MIT' })
    }

    test('by default reports everything installed, plus everything reachable', () => {
      h.withTempDir(dir => {
        fixture(dir)
        expect(sortedKeys(collect(dir))).toEqual([
          'dev@1.0.0', 'extraneous@1.0.0', 'opt@1.0.0', 'prod@1.0.0', 'root@1.0.0', 'transitive@1.0.0'
        ])
      })
    })

    test('--production reports only what ships', () => {
      h.withTempDir(dir => {
        fixture(dir)
        expect(sortedKeys(collect(dir, { production: true }))).toEqual([
          'opt@1.0.0', 'prod@1.0.0', 'root@1.0.0', 'transitive@1.0.0'
        ])
      })
    })

    test('--development reports only what does not ship', () => {
      h.withTempDir(dir => {
        fixture(dir)
        expect(sortedKeys(collect(dir, { development: true }))).toEqual(['dev@1.0.0', 'root@1.0.0'])
      })
    })

    test('both flags together fall back to reporting everything', () => {
      h.withTempDir(dir => {
        fixture(dir)
        expect(sortedKeys(collect(dir, { production: true, development: true }))).toEqual(
          sortedKeys(collect(dir))
        )
      })
    })

    test('a package reachable from both counts as production, not development', () => {
      h.withTempDir(dir => {
        h.writeProject(dir, {
          name: 'root',
          version: '1.0.0',
          license: 'MIT',
          dependencies: { prod: '1' },
          devDependencies: { shared: '1' }
        })
        h.writePackage(dir, 'prod', { license: 'MIT', dependencies: { shared: '1' } })
        h.writePackage(dir, 'shared', { license: 'MIT' })

        expect(sortedKeys(collect(dir, { production: true }))).toContain('shared@1.0.0')
        expect(sortedKeys(collect(dir, { development: true }))).not.toContain('shared@1.0.0')
      })
    })

    test('finds dependencies hoisted outside the project directory', () => {
      h.withTempDir(dir => {
        h.writeProject(dir, { name: 'mono', version: '1.0.0', private: true })
        h.writePackage(dir, 'hoisted', { version: '4.0.0', license: 'MIT' })
        const app = join(dir, 'packages', 'app')
        h.writeProject(app, { name: 'app', version: '1.0.0', license: 'MIT', dependencies: { hoisted: '4' } })

        // Nothing is installed under the project itself, so a plain directory
        // walk would report nothing at all.
        expect(sortedKeys(collect(app))).toEqual(['app@1.0.0', 'hoisted@4.0.0'])
        expect(sortedKeys(collect(app, { production: true }))).toEqual(['app@1.0.0', 'hoisted@4.0.0'])
      })
    })

    test('reports a duplicated name@version once, preferring the hoisted copy', () => {
      h.withTempDir(dir => {
        h.writeProject(dir, { name: 'root', version: '1.0.0', license: 'MIT', dependencies: { dup: '1', outer: '1' } })
        h.writePackage(dir, 'dup', { version: '1.0.0' }, { LICENSE: h.MIT_TEXT })
        const outer = h.writePackage(dir, 'outer', { dependencies: { dup: '1' } })
        h.writePackage(outer, 'dup', { version: '1.0.0' }, { LICENSE: h.ISC_TEXT })

        const packages = collect(dir)
        expect(Object.keys(packages ?? {}).filter(k => k === 'dup@1.0.0')).toHaveLength(1)
        // The hoisted copy is the one Node loads, so it is the one reported.
        expect(packages?.['dup@1.0.0'].licenses).toBe('MIT*')
      })
    })
  })

  describe('reported fields', () => {
    test('maps every field a package can contribute', () => {
      h.withTempDir(dir => {
        h.writeProject(dir, { name: 'root', version: '1.0.0', license: 'MIT' })
        h.writePackage(dir, 'full', {
          license: 'Apache-2.0',
          author: 'Jane Doe <jane@example.com> (https://jane.example)',
          repository: 'git+https://github.com/jane/full.git'
        } as never, { LICENSE: h.APACHE_TEXT, NOTICE: 'third party notice' })

        const info = collect(dir)?.['full@1.0.0']
        expect(info).toBeDefined()
        expect(info?.name).toBe('full@1.0.0')
        expect(info?.licenses).toBe('Apache-2.0')
        expect(info?.license).toBe(h.APACHE_TEXT)
        expect(info?.publisher).toBe('Jane Doe')
        expect(info?.email).toBe('jane@example.com')
        expect(info?.url).toBe('https://jane.example')
        expect(info?.repository).toBe('https://github.com/jane/full')
        expect(info?.notice).toBe('third party notice')
        expect(info?.licenseFile).toBe(join(dir, 'node_modules', 'full', 'LICENSE'))
        expect(info?.path).toBe(join(dir, 'node_modules', 'full'))
      })
    })

    test('omits optional fields the package does not provide', () => {
      h.withTempDir(dir => {
        h.writeProject(dir, { name: 'root', version: '1.0.0', license: 'MIT' })
        h.writePackage(dir, 'bare', { license: 'MIT' })

        const info = collect(dir)?.['bare@1.0.0'] as Record<string, unknown>
        expect(info.license).toBe('')
        for (const field of ['repository', 'publisher', 'email', 'url', 'notice', 'licenseFile']) {
          expect(field in info).toBe(false)
        }
        // The path is always reported, and stripped later before export.
        expect(info.path).toBeDefined()
      })
    })

    test('reports an undeterminable license as UNKNOWN', () => {
      h.withTempDir(dir => {
        h.writeProject(dir, { name: 'root', version: '1.0.0', license: 'MIT' })
        h.writePackage(dir, 'mystery')
        expect(collect(dir)?.['mystery@1.0.0'].licenses).toBe('UNKNOWN')
      })
    })
  })
})
