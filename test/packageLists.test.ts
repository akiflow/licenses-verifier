import { describe, expect, test } from 'bun:test'
import { listNamesPackage, readPackageList, readPackageLists, splitPackageKey } from '../src/utils/packageLists'

describe('splitPackageKey', () => {
  test('splits a plain name', () => {
    expect(splitPackageKey('lodash@4.17.21')).toEqual({ name: 'lodash', version: '4.17.21' })
  })

  test('splits a scoped name, whose own @ is not the separator', () => {
    expect(splitPackageKey('@scope/pkg@1.2.3')).toEqual({ name: '@scope/pkg', version: '1.2.3' })
  })

  test('tolerates a key with no version', () => {
    expect(splitPackageKey('lodash')).toEqual({ name: 'lodash', version: '' })
    expect(splitPackageKey('@scope/pkg')).toEqual({ name: '@scope/pkg', version: '' })
  })
})

describe('listNamesPackage', () => {
  test('a name and version names that one version', () => {
    expect(listNamesPackage(['dep@1.0.0'], 'dep@1.0.0')).toBe(true)
    expect(listNamesPackage(['dep@1.0.0'], 'dep@1.0.1')).toBe(false)
  })

  test('a bare name names every version of the package', () => {
    // The point of the bare form: updating a reviewed dependency does not
    // require editing package.json again.
    expect(listNamesPackage(['dep'], 'dep@1.0.0')).toBe(true)
    expect(listNamesPackage(['dep'], 'dep@99.0.0-beta.4')).toBe(true)
  })

  test('a bare scoped name names every version of it', () => {
    expect(listNamesPackage(['@scope/pkg'], '@scope/pkg@2.0.0')).toBe(true)
    expect(listNamesPackage(['@scope/pkg'], '@scope/other@2.0.0')).toBe(false)
  })

  test('does not match a package whose name merely starts alike', () => {
    expect(listNamesPackage(['dep'], 'dep-extra@1.0.0')).toBe(false)
    expect(listNamesPackage(['@scope/pkg'], '@scope/pkg-extra@1.0.0')).toBe(false)
  })

  test('an empty list names nothing', () => {
    expect(listNamesPackage([], 'dep@1.0.0')).toBe(false)
  })
})

describe('readPackageList', () => {
  test('keeps the strings and drops everything else', () => {
    expect(readPackageList(['a', 42, null, {}, 'b'])).toEqual(['a', 'b'])
  })

  test('treats anything that is not an array as empty', () => {
    for (const value of [undefined, null, 'a', 42, {}]) {
      expect(readPackageList(value)).toEqual([])
    }
  })
})

describe('readPackageLists', () => {
  test('reads the three lists of a manifest', () => {
    expect(readPackageLists({
      whitelistedLicenses: ['MIT'],
      whitelistedPackages: ['a@1.0.0'],
      excludedPackages: ['b']
    })).toEqual({ licenses: ['MIT'], whitelisted: ['a@1.0.0'], excluded: ['b'] })
  })

  test('tells an absent license whitelist from an empty one', () => {
    // An empty whitelist rejects everything; an absent one is only a warning.
    expect(readPackageLists({}).licenses).toBeNull()
    expect(readPackageLists({ whitelistedLicenses: [] }).licenses).toEqual([])
    expect(readPackageLists({ whitelistedLicenses: 'MIT' } as never).licenses).toBeNull()
  })

  test('reads an absent manifest as three empty lists', () => {
    expect(readPackageLists(null)).toEqual({ licenses: null, whitelisted: [], excluded: [] })
  })
})
