import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { start } from '../src/index'
import * as h from './helpers'

/** The kind of text a proprietary package ships: valid for that package only. */
const PROPRIETARY_TEXT = 'Copyright (c) Akiflow Inc.\n\nAll rights reserved.\n'

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
      expect(result?.packagesWithBorrowedLicense).toContain('no-text@1.0.0')
      expect(result?.passed).toBe(true)
      expect(result?.packagesWithoutLicense).toEqual([])
      // One line for all of them, however many there are: nothing has to be
      // done about any of them.
      expect(out).toContain('packages ship no copy of their license')
      expect(out).not.toContain('no-text@1.0.0')
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

  test('does not lend the text of one proprietary package to another', () => {
    h.withTempDir(dir => {
      h.writeProject(dir, {
        name: 'app', version: '1.0.0', license: 'MIT', whitelistedLicenses: ['MIT', 'UNLICENSED']
      })
      // The project ships its own license, so it is not itself part of what
      // the assertions below are about.
      h.writeFiles(dir, { LICENSE: h.MIT_TEXT })
      // Both declare UNLICENSED, which is not a license but the absence of one:
      // they share an identifier and no terms whatsoever. Copying the text of
      // the first onto the second would publish a grant that was never made.
      h.writePackage(dir, 'ships-terms', { license: 'UNLICENSED' }, { LICENSE: PROPRIETARY_TEXT })
      h.writePackage(dir, 'ships-nothing', { license: 'UNLICENSED' })

      const target = join(dir, 'out', 'app-packages.json')
      const { result, out } = h.captureConsole(() => start({ projectPath: dir, outputJsonFile: target }))

      expect(out).not.toContain('Using license from other package: UNLICENSED')
      expect(result?.packagesWithoutLicense).toEqual(['ships-nothing@1.0.0'])

      const packages = JSON.parse(readFileSync(target, 'utf8'))
      const byName = (name: string) => packages.find((p: { name: string }) => p.name === name)
      expect(byName('ships-terms@1.0.0').license).toBe(PROPRIETARY_TEXT)
      expect(byName('ships-nothing@1.0.0').license).toBe('')
    })
  })

  test('does not lend a text across UNKNOWN either', () => {
    h.withTempDir(dir => {
      h.writeProject(dir, {
        name: 'app', version: '1.0.0', license: 'MIT', whitelistedLicenses: ['MIT']
      })
      // The project ships its own license, so it is not itself part of what
      // the assertions below are about.
      h.writeFiles(dir, { LICENSE: h.MIT_TEXT })
      // An unrecognisable license file leaves the identifier UNKNOWN while
      // keeping the text: that text belongs to that package alone.
      h.writePackage(dir, 'odd-terms', {}, { LICENSE: 'Do whatever, signed Bob.' })
      h.writePackage(dir, 'no-terms', {})

      const { result, out } = h.captureConsole(() => start({ projectPath: dir }))

      expect(out).not.toContain('Using license from other package: UNKNOWN')
      expect(result?.packagesWithoutLicense).toEqual(['no-terms@1.0.0'])
    })
  })

  test('does not lend a text across SEE LICENSE IN, which points at one file', () => {
    h.withTempDir(dir => {
      h.writeProject(dir, {
        name: 'app', version: '1.0.0', license: 'MIT', whitelistedLicenses: ['MIT', 'SEE LICENSE IN LICENSE']
      })
      // The project ships its own license, so it is not itself part of what
      // the assertions below are about.
      h.writeFiles(dir, { LICENSE: h.MIT_TEXT })
      h.writePackage(dir, 'has-file', { license: 'SEE LICENSE IN LICENSE' }, { LICENSE: PROPRIETARY_TEXT })
      h.writePackage(dir, 'has-no-file', { license: 'SEE LICENSE IN LICENSE' })

      const { result, out } = h.captureConsole(() => start({ projectPath: dir }))

      expect(out).not.toContain('Using license from other package')
      expect(result?.packagesWithoutLicense).toEqual(['has-no-file@1.0.0'])
    })
  })

  test('writes no license file for an identifier that names no license', () => {
    h.withTempDir(dir => {
      h.writeProject(dir, {
        name: 'app', version: '1.0.0', license: 'MIT', whitelistedLicenses: ['MIT', 'UNLICENSED']
      })
      h.writePackage(dir, 'with-text', { license: 'MIT' }, { LICENSE: h.MIT_TEXT })
      h.writePackage(dir, 'proprietary', { license: 'UNLICENSED' }, { LICENSE: PROPRIETARY_TEXT })

      h.captureConsole(() => start({ projectPath: dir, outLicensesDir: join(dir, 'out') }))

      // An `UNLICENSED.txt` holding the terms of one arbitrary package would
      // read, to whoever reviews the export, as the terms of all of them.
      expect(existsSync(join(dir, 'out', 'licenses', 'MIT.txt'))).toBe(true)
      expect(existsSync(join(dir, 'out', 'licenses', 'UNLICENSED.txt'))).toBe(false)
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

  test('shows why a package with a non whitelisted license is installed', () => {
    h.withTempDir(dir => {
      h.writeProject(dir, {
        name: 'app', version: '1.0.0', license: 'MIT', whitelistedLicenses: ['MIT'],
        dependencies: { toolkit: '1' }
      })
      h.writeFiles(dir, { LICENSE: h.MIT_TEXT })
      h.writePackage(dir, 'toolkit', { license: 'MIT', dependencies: { copyleft: '1' } }, { LICENSE: h.MIT_TEXT })
      h.writePackage(dir, 'copyleft', { license: 'GPL-3.0' }, { LICENSE: h.GPL3_TEXT })

      const { out, result } = h.captureConsole(() => start({ projectPath: dir }))

      expect(result?.passed).toBe(false)
      expect(out).toContain('❗ GPL-3.0, used by 1 package:')
      expect(out).toContain('app@1.0.0')
      expect(out).toContain('└─ toolkit@1.0.0')
      // Nobody chose GPL-3.0: it arrived under a package that was chosen.
      expect(out).toContain('└─ copyleft@1.0.0 ❗')
    })
  })

  test('whitelisting a package accepts it whatever its license', () => {
    h.withTempDir(dir => {
      h.writeProject(dir, {
        name: 'app',
        version: '1.0.0',
        license: 'MIT',
        whitelistedLicenses: ['MIT'],
        whitelistedPackages: ['copyleft@1.0.0', 'mystery']
      })
      h.writeFiles(dir, { LICENSE: h.MIT_TEXT })
      h.writePackage(dir, 'copyleft', { license: 'GPL-3.0' }, { LICENSE: h.GPL3_TEXT })
      h.writePackage(dir, 'mystery')

      const { out, result } = h.captureConsole(() => start({ projectPath: dir }))

      expect(result?.passed).toBe(true)
      expect(result?.nonWhitelistedLicenses).toEqual([])
      expect(result?.packagesWithUnknownLicense).toEqual([])
      expect(result?.whitelistedPackages.sort()).toEqual(['copyleft@1.0.0', 'mystery@1.0.0'])
      expect(out).toContain('2 packages are whitelisted in package.json and were not checked')
    })
  })

  test('tells the reader how to whitelist what it just reported', () => {
    h.withTempDir(dir => {
      project(dir)
      h.writePackage(dir, 'copyleft', { license: 'GPL-3.0' }, { LICENSE: h.GPL3_TEXT })
      const { out } = h.captureConsole(() => start({ projectPath: dir }))
      expect(out).toContain('\'whitelistedLicenses\' in package.json, e.g. "GPL-3.0"')
      expect(out).toContain('\'whitelistedPackages\' in package.json, e.g. "copyleft@1.0.0"')
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

  test('writes every package with its license as a JSON array when asked', () => {
    h.withTempDir(dir => {
      project(dir)
      const target = join(dir, 'out', 'app-packages.json')
      h.captureConsole(() => start({ projectPath: dir, outputJsonFile: target }))
      const packages = JSON.parse(readFileSync(target, 'utf8'))
      // The same shape as the `.ts`/`.js` output: an array of self contained
      // entries, which is what an application ships to show its licenses.
      expect(Array.isArray(packages)).toBe(true)
      expect(packages.map((p: { name: string }) => p.name)).toEqual([
        'app@1.0.0', 'isc-dep@1.0.0', 'with-text@1.0.0'
      ])
      expect(packages[1]).toMatchObject({
        name: 'isc-dep@1.0.0',
        licenses: 'ISC',
        license: h.ISC_TEXT
      })
      // Internal fields must never reach the output.
      expect(packages[1].path).toBeUndefined()
      expect(packages[1].licenseFile).toBeUndefined()
    })
  })

  test('marks a private package as private in the JSON output', () => {
    h.withTempDir(dir => {
      project(dir)
      h.writePackage(dir, 'internal', { license: 'MIT', private: true }, { LICENSE: h.MIT_TEXT })
      const target = join(dir, 'out', 'app-packages.json')
      h.captureConsole(() => start({ projectPath: dir, outputJsonFile: target }))
      const packages = JSON.parse(readFileSync(target, 'utf8'))
      const internal = packages.find((p: { name: string }) => p.name === 'internal@1.0.0')
      expect(internal.private).toBe(true)
      const published = packages.find((p: { name: string }) => p.name === 'with-text@1.0.0')
      expect(published.private).toBeUndefined()
    })
  })

  test('writes the packages grouped by license when asked', () => {
    h.withTempDir(dir => {
      project(dir)
      const target = join(dir, 'out', 'byLicense.json')
      h.captureConsole(() => start({ projectPath: dir, outputGroupedJsonFile: target }))
      const grouped = JSON.parse(readFileSync(target, 'utf8'))
      expect(grouped.MIT).toEqual(['app@1.0.0', 'with-text@1.0.0'])
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

  test('writes all the outputs at once', () => {
    h.withTempDir(dir => {
      project(dir)
      h.captureConsole(() => start({
        projectPath: dir,
        outputTsOrJsFile: join(dir, 'out', 'licensesData.ts'),
        outLicensesDir: join(dir, 'out'),
        outputJsonFile: join(dir, 'out', 'app-packages.json'),
        outputGroupedJsonFile: join(dir, 'out', 'byLicense.json')
      }))
      expect(existsSync(join(dir, 'out', 'licensesData.ts'))).toBe(true)
      expect(existsSync(join(dir, 'out', 'licenses', 'MIT.txt'))).toBe(true)
      expect(existsSync(join(dir, 'out', 'app-packages.json'))).toBe(true)
      expect(existsSync(join(dir, 'out', 'byLicense.json'))).toBe(true)
    })
  })

  test('groups an unknown license under UNKNOWN in the JSON output', () => {
    h.withTempDir(dir => {
      h.writeProject(dir, { name: 'app', version: '1.0.0', license: 'MIT', whitelistedLicenses: ['MIT'] })
      h.writePackage(dir, 'mystery')
      const target = join(dir, 'out', 'byLicense.json')
      const { result } = h.captureConsole(() => start({ projectPath: dir, outputGroupedJsonFile: target }))
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
        projectPath: dir, production: true, outputGroupedJsonFile: join(dir, 'prod.json')
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
