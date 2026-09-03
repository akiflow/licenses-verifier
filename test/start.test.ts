import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { start } from '../src/index'
import * as h from './helpers'

/** A project with a whitelist, one MIT dependency shipping its license, and one not. */
function project (dir: string, manifest: Record<string, unknown> = {}) {
  h.writeProject(dir, {
    name: 'app',
    version: '1.0.0',
    license: 'MIT',
    whitelistedLicenses: ['MIT', 'ISC'],
    ...manifest
  })
  h.writePackage(dir, 'with-text', { license: 'MIT' }, { LICENSE: h.MIT_TEXT })
  h.writePackage(dir, 'isc-dep', { license: 'ISC' }, { LICENSE: h.ISC_TEXT })
  return dir
}

describe('start', () => {
  test('returns null and explains how to fix the path when nothing is found', () => {
    h.withTempDir(dir => {
      const { result, out } = h.captureConsole(() => start({ projectPath: join(dir, 'nowhere') }))
      expect(result).toBeNull()
      expect(out).toContain('No packages found in directory')
      expect(out).toContain("--projectPath=[pathToDirectory]")
    })
  })

  test('reports the directory it analysed', () => {
    h.withTempDir(dir => {
      project(dir)
      const { out } = h.captureConsole(() => start({ projectPath: dir }))
      expect(out).toContain('[LicenseVerifier] - Analyzing project in directory')
      expect(out).toContain(dir)
    })
  })

  test('passes a compliant project', () => {
    h.withTempDir(dir => {
      project(dir)
      const { result } = h.captureConsole(() => start({ projectPath: dir }))
      expect(result?.passed).toBe(true)
      expect(result?.totalPackages).toBe(3)
    })
  })

  test('fails a project using a license that is not whitelisted', () => {
    h.withTempDir(dir => {
      project(dir)
      h.writePackage(dir, 'copyleft', { license: 'GPL-3.0' }, { LICENSE: h.GPL3_TEXT })
      const { result } = h.captureConsole(() => start({ projectPath: dir }))
      expect(result?.passed).toBe(false)
      expect(result?.nonWhitelistedLicenses).toEqual(['GPL-3.0'])
    })
  })

  test('borrows the license text of the same license from another package', () => {
    h.withTempDir(dir => {
      project(dir)
      // Declares MIT but ships no license file.
      h.writePackage(dir, 'no-text', { license: 'MIT' })
      const { result, out } = h.captureConsole(() => start({ projectPath: dir }))
      expect(out).toContain('⚠ No license file for package: no-text@1.0.0')
      expect(out).toContain('Using license from other package: MIT')
      expect(result?.passed).toBe(true)
      expect(result?.packagesWithoutLicense).toEqual([])
    })
  })

  test('borrowing does not depend on the order packages are visited in', () => {
    h.withTempDir(dir => {
      // `aaa` sorts before `zzz`, so the package with no text is seen first.
      h.writeProject(dir, { name: 'app', version: '1.0.0', license: 'MIT', whitelistedLicenses: ['MIT'] })
      h.writePackage(dir, 'aaa-no-text', { license: 'MIT' })
      h.writePackage(dir, 'zzz-with-text', { license: 'MIT' }, { LICENSE: h.MIT_TEXT })

      const { result } = h.captureConsole(() => start({
        projectPath: dir,
        outputTsOrJsFile: join(dir, 'out', 'licenses.js')
      }))
      expect(result?.packagesWithoutLicense).toEqual([])

      const generated = readFileSync(join(dir, 'out', 'licenses.js'), 'utf8')
      expect(generated).toContain('Permission is hereby granted')
      expect(generated).not.toContain('license: ""')
    })
  })

  test('reports a package whose license text cannot be found anywhere', () => {
    h.withTempDir(dir => {
      h.writeProject(dir, { name: 'app', version: '1.0.0', license: 'MIT', whitelistedLicenses: ['MIT', 'ISC'] })
      // The only ISC package ships no text, so there is nothing to borrow.
      h.writePackage(dir, 'lonely', { license: 'ISC' })
      const { result, out } = h.captureConsole(() => start({ projectPath: dir }))
      expect(out).toContain('❗ No license file for package: lonely@1.0.0')
      expect(out).toContain('No license found for this package')
      expect(result?.packagesWithoutLicense).toContain('lonely@1.0.0')
      // Missing text is not a compliance failure: the license is known.
      expect(result?.passed).toBe(true)
    })
  })

  test('writes the TypeScript module when asked, without machine specific paths', () => {
    h.withTempDir(dir => {
      project(dir)
      const target = join(dir, 'out', 'licensesData.ts')
      h.captureConsole(() => start({ projectPath: dir, outputTsOrJsFile: target }))

      const content = readFileSync(target, 'utf8')
      expect(content).toContain('export interface IAppPackages')
      expect(content).toContain('with-text@1.0.0')
      // The absolute paths of the machine that ran the check must not leak.
      expect(content).not.toContain('licenseFile:')
      expect(content).not.toContain('path:')
      expect(content).not.toContain(dir)
    })
  })

  test('writes the license texts when asked', () => {
    h.withTempDir(dir => {
      project(dir)
      h.captureConsole(() => start({ projectPath: dir, outLicensesDir: join(dir, 'out') }))
      expect(readFileSync(join(dir, 'out', 'licenses', 'MIT.txt'), 'utf8')).toBe(h.MIT_TEXT)
      expect(readFileSync(join(dir, 'out', 'licenses', 'ISC.txt'), 'utf8')).toBe(h.ISC_TEXT)
    })
  })

  test('writes the packages grouped by license when asked', () => {
    h.withTempDir(dir => {
      project(dir)
      const target = join(dir, 'out', 'byLicense.json')
      h.captureConsole(() => start({ projectPath: dir, outputJsonFile: target }))
      const grouped = JSON.parse(readFileSync(target, 'utf8'))
      expect(grouped.MIT.sort()).toEqual(['app@1.0.0', 'with-text@1.0.0'])
      expect(grouped.ISC).toEqual(['isc-dep@1.0.0'])
    })
  })

  test('writes nothing when no output option is given', () => {
    h.withTempDir(dir => {
      project(dir)
      h.captureConsole(() => start({ projectPath: dir }))
      expect(existsSync(join(dir, 'out'))).toBe(false)
      expect(existsSync(join(dir, 'licenses'))).toBe(false)
    })
  })

  test('writes all three outputs at once', () => {
    h.withTempDir(dir => {
      project(dir)
      h.captureConsole(() => start({
        projectPath: dir,
        outputTsOrJsFile: join(dir, 'out', 'licensesData.ts'),
        outLicensesDir: join(dir, 'out'),
        outputJsonFile: join(dir, 'out', 'byLicense.json')
      }))
      expect(existsSync(join(dir, 'out', 'licensesData.ts'))).toBe(true)
      expect(existsSync(join(dir, 'out', 'licenses', 'MIT.txt'))).toBe(true)
      expect(existsSync(join(dir, 'out', 'byLicense.json'))).toBe(true)
    })
  })

  test('groups an unknown license under UNKNOWN in the JSON output', () => {
    h.withTempDir(dir => {
      h.writeProject(dir, { name: 'app', version: '1.0.0', license: 'MIT', whitelistedLicenses: ['MIT'] })
      h.writePackage(dir, 'mystery')
      const target = join(dir, 'out', 'byLicense.json')
      const { result } = h.captureConsole(() => start({ projectPath: dir, outputJsonFile: target }))
      expect(JSON.parse(readFileSync(target, 'utf8')).UNKNOWN).toEqual(['mystery@1.0.0'])
      expect(result?.passed).toBe(false)
    })
  })

  test('honours --production and --development', () => {
    h.withTempDir(dir => {
      h.writeProject(dir, {
        name: 'app',
        version: '1.0.0',
        license: 'MIT',
        whitelistedLicenses: ['MIT', 'ISC'],
        dependencies: { 'prod-dep': '1' },
        devDependencies: { 'dev-dep': '1' }
      })
      h.writePackage(dir, 'prod-dep', { license: 'MIT' }, { LICENSE: h.MIT_TEXT })
      h.writePackage(dir, 'dev-dep', { license: 'ISC' }, { LICENSE: h.ISC_TEXT })

      const production = h.captureConsole(() => start({
        projectPath: dir, production: true, outputJsonFile: join(dir, 'prod.json')
      }))
      expect(production.result?.totalPackages).toBe(2)
      expect(JSON.parse(readFileSync(join(dir, 'prod.json'), 'utf8'))).toEqual({
        MIT: ['app@1.0.0', 'prod-dep@1.0.0']
      })

      const development = h.captureConsole(() => start({ projectPath: dir, development: true }))
      expect(development.result?.totalPackages).toBe(2)
    })
  })

  test('resolves a relative project path against the working directory', () => {
    h.withTempDir(dir => {
      project(join(dir, 'nested'))
      h.withCwd(dir, () => {
        const { result } = h.captureConsole(() => start({ projectPath: './nested' }))
        expect(result?.passed).toBe(true)
        expect(result?.totalPackages).toBe(3)
      })
    })
  })
})
