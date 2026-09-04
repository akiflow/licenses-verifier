import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { LicensesData } from '../src/output/LicensesData'
import type { IModuleInfo } from '../src/types'
import * as h from './helpers'

const mit: IModuleInfo = { name: 'a@1.0.0', licenses: 'MIT', license: h.MIT_TEXT }

/** Reads back a generated module by evaluating its exported array. */
function readGenerated (path: string): Array<Record<string, unknown>> {
  const source = readFileSync(path, 'utf8')
  const literal = source.slice(source.indexOf('= [') + 2)
  // eslint-disable-next-line no-new-func
  return new Function(`return ${literal}`)()
}

describe('licenseToFileName', () => {
  test('keeps a plain identifier', () => {
    expect(LicensesData.licenseToFileName('MIT')).toBe('MIT.txt')
    expect(LicensesData.licenseToFileName('BSD-3-Clause')).toBe('BSD-3-Clause.txt')
  })

  test('marks an inferred identifier', () => {
    expect(LicensesData.licenseToFileName('MIT*')).toBe('MIT_alt.txt')
  })

  test('keeps an SPDX expression readable', () => {
    expect(LicensesData.licenseToFileName('(MIT OR CC0-1.0)')).toBe('(MIT_OR_CC0-1.0).txt')
    expect(LicensesData.licenseToFileName('(MIT AND CC-BY-3.0)')).toBe('(MIT_AND_CC-BY-3.0).txt')
  })

  test('replaces every character Windows rejects in a file name', () => {
    for (const forbidden of ['/', '\\', ':', '?', '"', '<', '>', '|', '*']) {
      const name = LicensesData.licenseToFileName(`A${forbidden}B`)
      expect(name).not.toContain(forbidden)
      expect(name.endsWith('.txt')).toBe(true)
    }
  })

  test('collapses and trims the separators it introduces', () => {
    expect(LicensesData.licenseToFileName('A///B')).toBe('A_B.txt')
    expect(LicensesData.licenseToFileName('/MIT/')).toBe('MIT.txt')
    expect(LicensesData.licenseToFileName('  MIT  ')).toBe('MIT.txt')
  })

  test('falls back to UNKNOWN when nothing usable is left', () => {
    expect(LicensesData.licenseToFileName('')).toBe('UNKNOWN.txt')
    expect(LicensesData.licenseToFileName('///')).toBe('UNKNOWN.txt')
  })
})

describe('exportLicensesToTsOrJsFile', () => {
  test('writes a TypeScript module with the interface and the type annotation', () => {
    h.withTempDir(dir => {
      const target = join(dir, 'out', 'licensesData.ts')
      new LicensesData().exportLicensesToTsOrJsFile([mit], target)
      const content = readFileSync(target, 'utf8')
      expect(content).toContain('export interface IAppPackages')
      expect(content).toContain('export const APP_PACKAGES: Array<IAppPackages> = [')
      expect(content).toContain('/** Auto generated file - DO NOT EDIT */')
      expect(content).toContain('/* eslint-disable */')
    })
  })

  test('writes a JavaScript module without the interface', () => {
    h.withTempDir(dir => {
      const target = join(dir, 'licensesData.js')
      new LicensesData().exportLicensesToTsOrJsFile([mit], target)
      const content = readFileSync(target, 'utf8')
      expect(content).not.toContain('export interface')
      expect(content).toContain('export const APP_PACKAGES = [')
    })
  })

  test('treats .tsx as TypeScript and an unknown extension as JavaScript', () => {
    h.withTempDir(dir => {
      new LicensesData().exportLicensesToTsOrJsFile([mit], join(dir, 'a.tsx'))
      expect(readFileSync(join(dir, 'a.tsx'), 'utf8')).toContain('export interface IAppPackages')
      new LicensesData().exportLicensesToTsOrJsFile([mit], join(dir, 'b.mjs'))
      expect(readFileSync(join(dir, 'b.mjs'), 'utf8')).not.toContain('export interface')
    })
  })

  test('writes unquoted keys so the module reads like handwritten code', () => {
    h.withTempDir(dir => {
      const target = join(dir, 'a.js')
      new LicensesData().exportLicensesToTsOrJsFile([{ ...mit, repository: 'https://e.com' }], target)
      const content = readFileSync(target, 'utf8')
      expect(content).toContain('name: "a@1.0.0"')
      expect(content).toContain('repository: "https://e.com"')
      expect(content).not.toContain('"name":')
    })
  })

  test('round trips every field', () => {
    h.withTempDir(dir => {
      const target = join(dir, 'a.js')
      const info: IModuleInfo = {
        name: 'a@1.0.0',
        licenses: 'MIT',
        license: h.MIT_TEXT,
        repository: 'https://e.com',
        publisher: 'Jane',
        email: 'j@e.com',
        url: 'https://jane.example',
        notice: 'notice text'
      }
      new LicensesData().exportLicensesToTsOrJsFile([info], target)
      expect(readGenerated(target)[0]).toEqual(info as unknown as Record<string, unknown>)
    })
  })

  test('does not corrupt a license text that mentions a field name', () => {
    h.withTempDir(dir => {
      // The previous implementation ran a regex over the serialized JSON, so a
      // license text containing `"name": ` was rewritten into invalid output.
      const tricky = 'Attribution requires the "name": of the author.\nAlso "license": matters.'
      const target = join(dir, 'a.js')
      new LicensesData().exportLicensesToTsOrJsFile([{ ...mit, license: tricky }], target)
      expect(readGenerated(target)[0].license).toBe(tricky)
    })
  })

  test('quotes a key that is not a valid identifier', () => {
    h.withTempDir(dir => {
      const target = join(dir, 'a.js')
      const odd = { ...mit, 'not-an-identifier': 'value' } as unknown as IModuleInfo
      new LicensesData().exportLicensesToTsOrJsFile([odd], target)
      const content = readFileSync(target, 'utf8')
      expect(content).toContain('"not-an-identifier": "value"')
      expect(readGenerated(target)[0]['not-an-identifier']).toBe('value')
    })
  })

  test('skips fields that are undefined', () => {
    h.withTempDir(dir => {
      const target = join(dir, 'a.js')
      new LicensesData().exportLicensesToTsOrJsFile([{ ...mit, notice: undefined }], target)
      expect(readFileSync(target, 'utf8')).not.toContain('notice')
    })
  })

  test('writes several packages', () => {
    h.withTempDir(dir => {
      const target = join(dir, 'a.js')
      new LicensesData().exportLicensesToTsOrJsFile([mit, { ...mit, name: 'b@2.0.0' }], target)
      expect(readGenerated(target).map(p => p.name)).toEqual(['a@1.0.0', 'b@2.0.0'])
    })
  })

  test('falls back to licenses.js when the path names no file', () => {
    h.withTempDir(dir => {
      h.withCwd(dir, () => {
        new LicensesData().exportLicensesToTsOrJsFile([mit], '')
        expect(existsSync(join(dir, 'licenses.js'))).toBe(true)
      })
    })
  })

  test('a path ending in a separator names the file, not a directory', () => {
    h.withTempDir(dir => {
      // `path.parse` strips the trailing separator, so `out/` means a file
      // called `out`. The option is documented as <pathAndFilename>.
      new LicensesData().exportLicensesToTsOrJsFile([mit], join(dir, 'out') + '/')
      expect(existsSync(join(dir, 'out'))).toBe(true)
    })
  })
})

describe('saveAllLicencesToTxtFile', () => {
  test('writes one file per license under a licenses subdirectory', () => {
    h.withTempDir(dir => {
      LicensesData.saveAllLicencesToTxtFile({ MIT: h.MIT_TEXT, 'ISC*': h.ISC_TEXT }, join(dir, 'out'))
      expect(readFileSync(join(dir, 'out', 'licenses', 'MIT.txt'), 'utf8')).toBe(h.MIT_TEXT)
      expect(readFileSync(join(dir, 'out', 'licenses', 'ISC_alt.txt'), 'utf8')).toBe(h.ISC_TEXT)
    })
  })

  test('skips a license with no text', () => {
    h.withTempDir(dir => {
      LicensesData.saveAllLicencesToTxtFile({ MIT: h.MIT_TEXT, EMPTY: '' }, join(dir, 'out'))
      expect(existsSync(join(dir, 'out', 'licenses', 'EMPTY.txt'))).toBe(false)
    })
  })

  test('writes nothing when there are no licenses', () => {
    h.withTempDir(dir => {
      LicensesData.saveAllLicencesToTxtFile({}, join(dir, 'out'))
      expect(existsSync(join(dir, 'out', 'licenses'))).toBe(false)
    })
  })
})

describe('saveToJsonAllPackages', () => {
  test('writes the packages as a JSON array, creating the directories', () => {
    h.withTempDir(dir => {
      const target = join(dir, 'deep', 'nested', 'app-packages.json')
      LicensesData.saveToJsonAllPackages([
        { name: 'a@1.0.0', licenses: 'MIT', license: 'MIT text', repository: 'https://example.com/a' },
        { name: 'b@2.0.0', licenses: 'ISC', license: 'ISC text', private: true }
      ], target)
      const content = readFileSync(target, 'utf8')
      expect(JSON.parse(content)).toEqual([
        { name: 'a@1.0.0', licenses: 'MIT', license: 'MIT text', repository: 'https://example.com/a' },
        { name: 'b@2.0.0', licenses: 'ISC', license: 'ISC text', private: true }
      ])
      expect(content.endsWith('\n')).toBe(true)
      expect(content.startsWith('[\n  {')).toBe(true)
    })
  })

  test('falls back to app-packages.json when the path names no file', () => {
    h.withTempDir(dir => {
      h.withCwd(dir, () => {
        LicensesData.saveToJsonAllPackages([], '')
        expect(existsSync(join(dir, 'app-packages.json'))).toBe(true)
      })
    })
  })
})

describe('saveToJsonAllPackagesUsedGroupedByLicense', () => {
  test('writes formatted JSON, creating the directories', () => {
    h.withTempDir(dir => {
      const target = join(dir, 'deep', 'nested', 'by-license.json')
      LicensesData.saveToJsonAllPackagesUsedGroupedByLicense({ MIT: ['a@1.0.0', 'b@2.0.0'] }, target)
      const content = readFileSync(target, 'utf8')
      expect(JSON.parse(content)).toEqual({ MIT: ['a@1.0.0', 'b@2.0.0'] })
      expect(content.endsWith('\n')).toBe(true)
      expect(content).toContain('\n  "MIT"')
    })
  })

  test('falls back to licenses.json when the path names no file', () => {
    h.withTempDir(dir => {
      h.withCwd(dir, () => {
        LicensesData.saveToJsonAllPackagesUsedGroupedByLicense({ MIT: [] }, '')
        expect(existsSync(join(dir, 'licenses.json'))).toBe(true)
      })
    })
  })
})
