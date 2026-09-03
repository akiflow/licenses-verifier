import { describe, expect, test } from 'bun:test'
import { mkdirSync } from 'fs'
import { join } from 'path'
import {
  declaredLicenseId,
  findLicenseFile,
  findNotice,
  findReadmeFile,
  resolveLicense
} from '../src/input/licenseResolver'
import * as h from './helpers'

/** Writes a bare package directory and resolves its license. */
function resolve (files: h.IFiles, manifest: Record<string, unknown> = {}) {
  return h.withTempDir(dir => {
    const pkg = h.writeBarePackage(join(dir, 'pkg'), { name: 'p', version: '1.0.0', ...manifest }, files)
    return resolveLicense(pkg, { name: 'p', version: '1.0.0', ...manifest })
  })
}

describe('declaredLicenseId', () => {
  test('reads the modern string field', () => {
    expect(declaredLicenseId({ license: 'MIT' })).toBe('MIT')
    expect(declaredLicenseId({ license: '  Apache-2.0  ' })).toBe('Apache-2.0')
    expect(declaredLicenseId({ license: '(MIT OR Apache-2.0)' })).toBe('(MIT OR Apache-2.0)')
  })

  test('reads the deprecated object field', () => {
    expect(declaredLicenseId({ license: { type: 'ISC' } })).toBe('ISC')
    expect(declaredLicenseId({ license: { type: '  ISC  ', url: 'x' } })).toBe('ISC')
  })

  test('reads the legacy licenses array', () => {
    expect(declaredLicenseId({ licenses: [{ type: 'MIT' }] })).toBe('MIT')
    expect(declaredLicenseId({ licenses: ['MIT'] })).toBe('MIT')
    expect(declaredLicenseId({ licenses: [{ type: 'MIT' }, { type: 'GPL-2.0' }] })).toBe('(MIT OR GPL-2.0)')
    expect(declaredLicenseId({ licenses: ['MIT', 'ISC', 'Apache-2.0'] })).toBe('(MIT OR ISC OR Apache-2.0)')
  })

  test('reads the legacy licenses string', () => {
    expect(declaredLicenseId({ licenses: 'MIT' })).toBe('MIT')
  })

  test('prefers license over licenses', () => {
    expect(declaredLicenseId({ license: 'MIT', licenses: ['GPL-3.0'] })).toBe('MIT')
  })

  test('returns null when nothing usable is declared', () => {
    expect(declaredLicenseId({})).toBeNull()
    expect(declaredLicenseId({ license: '' })).toBeNull()
    expect(declaredLicenseId({ license: '   ' })).toBeNull()
    expect(declaredLicenseId({ license: {} })).toBeNull()
    expect(declaredLicenseId({ license: { type: '  ' } })).toBeNull()
    expect(declaredLicenseId({ licenses: [] })).toBeNull()
    expect(declaredLicenseId({ licenses: [{}, { type: '' }] })).toBeNull()
    expect(declaredLicenseId({ license: 42 } as never)).toBeNull()
  })
})

describe('findLicenseFile', () => {
  const names = [
    'LICENSE', 'license', 'License', 'LICENCE', 'licence',
    'LICENSE.md', 'LICENSE.txt', 'LICENSE.markdown', 'LICENCE.rst',
    'LICENSE-MIT', 'LICENSE.BSD', 'license_apache',
    'COPYING', 'COPYING.txt', 'UNLICENSE'
  ]

  for (const name of names) {
    test(`finds ${name}`, () => {
      h.withTempDir(dir => {
        const pkg = h.writeBarePackage(join(dir, 'pkg'), { name: 'p' }, { [name]: h.MIT_TEXT })
        const found = findLicenseFile(pkg)
        expect(found?.path).toBe(join(pkg, name))
        expect(found?.text).toBe(h.MIT_TEXT)
      })
    })
  }

  test('prefers the plain LICENSE over a suffixed variant', () => {
    h.withTempDir(dir => {
      const pkg = h.writeBarePackage(join(dir, 'pkg'), { name: 'p' }, {
        LICENSE: h.MIT_TEXT,
        'LICENSE-MIT': h.ISC_TEXT,
        COPYING: h.ISC_TEXT
      })
      expect(findLicenseFile(pkg)?.text).toBe(h.MIT_TEXT)
    })
  })

  test('prefers an extensioned license file over a suffixed one', () => {
    h.withTempDir(dir => {
      const pkg = h.writeBarePackage(join(dir, 'pkg'), { name: 'p' }, {
        'LICENSE.md': h.MIT_TEXT,
        'LICENSE-OTHER': h.ISC_TEXT
      })
      expect(findLicenseFile(pkg)?.text).toBe(h.MIT_TEXT)
    })
  })

  test('is deterministic when several files match the same pattern', () => {
    h.withTempDir(dir => {
      const pkg = h.writeBarePackage(join(dir, 'pkg'), { name: 'p' }, {
        'LICENSE-b': 'b', 'LICENSE-a': 'a', 'LICENSE-c': 'c'
      })
      // Sorted, so the result does not depend on file system ordering.
      expect(findLicenseFile(pkg)?.text).toBe('a')
    })
  })

  test('ignores a directory called LICENSE', () => {
    h.withTempDir(dir => {
      const pkg = h.writeBarePackage(join(dir, 'pkg'), { name: 'p' })
      mkdirSync(join(pkg, 'LICENSE'))
      expect(findLicenseFile(pkg)).toBeNull()
    })
  })

  test('returns null when there is no license file', () => {
    h.withTempDir(dir => {
      const pkg = h.writeBarePackage(join(dir, 'pkg'), { name: 'p' }, { 'index.js': '' })
      expect(findLicenseFile(pkg)).toBeNull()
      expect(findLicenseFile(join(dir, 'missing'))).toBeNull()
    })
  })
})

describe('findReadmeFile', () => {
  for (const name of ['README', 'readme', 'README.md', 'ReadMe.markdown', 'README.txt', 'README.rst']) {
    test(`finds ${name}`, () => {
      h.withTempDir(dir => {
        const pkg = h.writeBarePackage(join(dir, 'pkg'), { name: 'p' }, { [name]: 'text' })
        expect(findReadmeFile(pkg)?.path).toBe(join(pkg, name))
      })
    })
  }

  test('returns null when there is no readme', () => {
    h.withTempDir(dir => {
      const pkg = h.writeBarePackage(join(dir, 'pkg'), { name: 'p' }, { 'READMExtra.md': 'x' })
      expect(findReadmeFile(pkg)).toBeNull()
    })
  })
})

describe('findNotice', () => {
  for (const name of ['NOTICE', 'notice', 'NOTICE.txt', 'NOTICE.md', 'CopyrightNotice.txt', 'COPYRIGHT']) {
    test(`finds ${name}`, () => {
      h.withTempDir(dir => {
        const pkg = h.writeBarePackage(join(dir, 'pkg'), { name: 'p' }, { [name]: 'third party work' })
        expect(findNotice(pkg)).toBe('third party work')
      })
    })
  }

  test('prefers the plain NOTICE file', () => {
    h.withTempDir(dir => {
      const pkg = h.writeBarePackage(join(dir, 'pkg'), { name: 'p' }, {
        NOTICE: 'plain', 'NOTICE.txt': 'txt', 'CopyrightNotice.txt': 'legacy'
      })
      expect(findNotice(pkg)).toBe('plain')
    })
  })

  test('returns null when there is no notice', () => {
    h.withTempDir(dir => {
      expect(findNotice(h.writeBarePackage(join(dir, 'pkg'), { name: 'p' }))).toBeNull()
    })
  })
})

describe('resolveLicense', () => {
  test('declared license with a license file: uses both', () => {
    const resolved = resolve({ LICENSE: h.MIT_TEXT }, { license: 'MIT' })
    expect(resolved.id).toBe('MIT')
    expect(resolved.licenseText).toBe(h.MIT_TEXT)
    expect(resolved.licenseFile).toMatch(/LICENSE$/)
  })

  test('the declared license wins over the shipped text', () => {
    // A package may ship a license file that does not match what it declares.
    const resolved = resolve({ LICENSE: h.MIT_TEXT }, { license: 'Apache-2.0' })
    expect(resolved.id).toBe('Apache-2.0')
    expect(resolved.licenseText).toBe(h.MIT_TEXT)
  })

  test('no declared license: infers from the license file and marks it', () => {
    const resolved = resolve({ LICENSE: h.ISC_TEXT })
    expect(resolved.id).toBe('ISC*')
    expect(resolved.licenseText).toBe(h.ISC_TEXT)
  })

  test('no declared license and an unrecognisable license file: UNKNOWN, text kept', () => {
    const resolved = resolve({ LICENSE: 'Do whatever, signed Bob.' })
    expect(resolved.id).toBe('UNKNOWN')
    expect(resolved.licenseText).toBe('Do whatever, signed Bob.')
  })

  test('no license file: infers from a README that embeds the license', () => {
    const resolved = resolve({ 'README.md': `# p\n\n${h.MIT_TEXT}` })
    expect(resolved.id).toBe('MIT*')
    expect(resolved.licenseFile).toMatch(/README\.md$/)
  })

  test('declared license and a README that embeds it: README supplies the text', () => {
    const resolved = resolve({ 'README.md': `# p\n\n${h.MIT_TEXT}` }, { license: 'MIT' })
    expect(resolved.id).toBe('MIT')
    expect(resolved.licenseFile).toMatch(/README\.md$/)
    expect(resolved.licenseText).toContain('Permission is hereby granted')
  })

  test('a README that only name-drops a license supplies nothing', () => {
    // Recording pages of unrelated prose as "the MIT license" would make the
    // exported report useless, and the text is then reused by other packages.
    const resolved = resolve({ 'README.md': '# p\n\nLicensed under MIT. Enjoy.' }, { license: 'MIT' })
    expect(resolved.id).toBe('MIT')
    expect(resolved.licenseFile).toBeUndefined()
    expect(resolved.licenseText).toBeUndefined()
  })

  test('a license file is preferred over a README even when both hold a license', () => {
    const resolved = resolve({ LICENSE: h.ISC_TEXT, 'README.md': h.MIT_TEXT })
    expect(resolved.id).toBe('ISC*')
    expect(resolved.licenseFile).toMatch(/LICENSE$/)
  })

  test('nothing at all: UNKNOWN, or UNLICENSED for a private package', () => {
    expect(resolve({}).id).toBe('UNKNOWN')
    expect(resolve({}, { private: true }).id).toBe('UNLICENSED')
    expect(resolve({}, { private: false }).id).toBe('UNKNOWN')
    // A declared license still wins over the private flag.
    expect(resolve({}, { private: true, license: 'MIT' }).id).toBe('MIT')
  })

  test('reports the notice alongside the license', () => {
    const resolved = resolve({ LICENSE: h.APACHE_TEXT, NOTICE: 'includes work by others' }, { license: 'Apache-2.0' })
    expect(resolved.notice).toBe('includes work by others')
  })

  test('leaves the notice undefined when the package ships none', () => {
    expect(resolve({ LICENSE: h.MIT_TEXT }, { license: 'MIT' }).notice).toBeUndefined()
  })
})
