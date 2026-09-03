import { describe, expect, test } from 'bun:test'
import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { dependencyNames, parsePerson, parseRepository, readManifest } from '../src/utils/manifest'
import { withTempDir } from './helpers'

describe('readManifest', () => {
  test('reads a valid manifest', () => {
    withTempDir(dir => {
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'a', version: '1.2.3' }))
      expect(readManifest(dir)).toEqual({ name: 'a', version: '1.2.3' })
    })
  })

  test('returns null when there is no manifest', () => {
    withTempDir(dir => {
      expect(readManifest(dir)).toBeNull()
      expect(readManifest(join(dir, 'does', 'not', 'exist'))).toBeNull()
    })
  })

  test('returns null for a manifest that is not valid JSON', () => {
    withTempDir(dir => {
      writeFileSync(join(dir, 'package.json'), '{ "name": "a", ')
      expect(readManifest(dir)).toBeNull()
    })
  })

  test('returns null for JSON that is not an object', () => {
    for (const content of ['[]', '"a string"', 'null', '42', 'true']) {
      withTempDir(dir => {
        writeFileSync(join(dir, 'package.json'), content)
        expect(readManifest(dir)).toBeNull()
      })
    }
  })

  test('returns null when package.json is a directory', () => {
    withTempDir(dir => {
      mkdirSync(join(dir, 'package.json'))
      expect(readManifest(dir)).toBeNull()
    })
  })
})

describe('dependencyNames', () => {
  const manifest = {
    dependencies: { a: '1', b: '1' },
    devDependencies: { c: '1' },
    optionalDependencies: { b: '1', d: '1' },
    peerDependencies: { e: '1' }
  }

  test('collects the names of the requested fields', () => {
    expect(dependencyNames(manifest, ['dependencies'])).toEqual(['a', 'b'])
    expect(dependencyNames(manifest, ['devDependencies'])).toEqual(['c'])
    expect(dependencyNames(manifest, ['peerDependencies'])).toEqual(['e'])
  })

  test('deduplicates names across fields', () => {
    expect(dependencyNames(manifest, ['dependencies', 'optionalDependencies'])).toEqual(['a', 'b', 'd'])
  })

  test('returns an empty list for a null manifest or absent fields', () => {
    expect(dependencyNames(null, ['dependencies'])).toEqual([])
    expect(dependencyNames({}, ['dependencies', 'devDependencies'])).toEqual([])
    expect(dependencyNames(manifest, [])).toEqual([])
  })

  test('ignores a dependency field that is not an object', () => {
    expect(dependencyNames({ dependencies: 'nonsense' } as never, ['dependencies'])).toEqual([])
    expect(dependencyNames({ dependencies: null } as never, ['dependencies'])).toEqual([])
  })
})

describe('parsePerson', () => {
  test('parses the shorthand string form', () => {
    expect(parsePerson('Jane Doe <jane@example.com> (https://example.com)')).toEqual({
      name: 'Jane Doe', email: 'jane@example.com', url: 'https://example.com'
    })
  })

  test('parses partial shorthand strings', () => {
    expect(parsePerson('Jane Doe')).toEqual({ name: 'Jane Doe', email: undefined, url: undefined })
    expect(parsePerson('Jane <jane@example.com>')).toEqual({ name: 'Jane', email: 'jane@example.com', url: undefined })
    expect(parsePerson('Jane (https://example.com)')).toEqual({ name: 'Jane', email: undefined, url: 'https://example.com' })
    expect(parsePerson('<jane@example.com>')).toEqual({ name: undefined, email: 'jane@example.com', url: undefined })
  })

  test('parses the object form', () => {
    expect(parsePerson({ name: 'Jane', email: 'j@e.com', url: 'https://e.com' })).toEqual({
      name: 'Jane', email: 'j@e.com', url: 'https://e.com'
    })
    expect(parsePerson({})).toEqual({ name: undefined, email: undefined, url: undefined })
  })

  test('ignores object fields that are not strings', () => {
    expect(parsePerson({ name: 42, email: [], url: {} } as never)).toEqual({
      name: undefined, email: undefined, url: undefined
    })
  })

  test('returns an empty object for missing or unusable input', () => {
    expect(parsePerson(undefined)).toEqual({})
    expect(parsePerson('')).toEqual({})
    expect(parsePerson(42 as never)).toEqual({})
  })
})

describe('parseRepository', () => {
  const cases: Array<[string, string]> = [
    ['https://github.com/a/b', 'https://github.com/a/b'],
    ['https://github.com/a/b.git', 'https://github.com/a/b'],
    ['git+https://github.com/a/b.git', 'https://github.com/a/b'],
    ['git://github.com/a/b.git', 'https://github.com/a/b'],
    ['http://github.com/a/b', 'https://github.com/a/b'],
    ['ssh://github.com/a/b.git', 'https://github.com/a/b'],
    ['ssh://git@github.com/a/b.git', 'https://github.com/a/b'],
    ['git+ssh://git@github.com/a/b.git', 'https://github.com/a/b'],
    ['git@github.com:a/b.git', 'https://github.com/a/b'],
    ['https://github.com/a/b.git#main', 'https://github.com/a/b'],
    ['a/b', 'https://github.com/a/b'],
    ['github:a/b', 'https://github.com/a/b'],
    ['gitlab:a/b', 'https://gitlab.com/a/b'],
    ['bitbucket:a/b', 'https://bitbucket.org/a/b'],
    ['https://example.com/a/b', 'https://example.com/a/b']
  ]

  for (const [input, expected] of cases) {
    test(`normalizes ${input}`, () => {
      expect(parseRepository({ repository: input })).toBe(expected)
      expect(parseRepository({ repository: { type: 'git', url: input } })).toBe(expected)
    })
  }

  test('falls back to homepage when there is no repository', () => {
    expect(parseRepository({ homepage: 'https://example.com' })).toBe('https://example.com')
    expect(parseRepository({ repository: { type: 'git' }, homepage: 'https://example.com' })).toBe('https://example.com')
  })

  test('returns undefined when there is nothing to report', () => {
    expect(parseRepository({})).toBeUndefined()
    expect(parseRepository({ repository: {} })).toBeUndefined()
    expect(parseRepository({ homepage: 42 } as never)).toBeUndefined()
  })

  test('ignores a repository url that is not a string', () => {
    expect(parseRepository({ repository: { url: 42 } } as never)).toBeUndefined()
    expect(parseRepository({ repository: 42 } as never)).toBeUndefined()
  })
})
