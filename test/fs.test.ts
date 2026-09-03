import { describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'fs'
import { join, win32 } from 'path'
import { FsHelpers } from '../src/utils/fs'
import { withCwd, withTempDir } from './helpers'

describe('createDirIfNotExists', () => {
  test('creates a directory and its parents', () => {
    withTempDir(dir => {
      const target = join(dir, 'a', 'b', 'c')
      FsHelpers.createDirIfNotExists(target)
      expect(existsSync(target)).toBe(true)
    })
  })

  test('does nothing when the directory already exists', () => {
    withTempDir(dir => {
      FsHelpers.createDirIfNotExists(dir)
      FsHelpers.createDirIfNotExists(dir)
      expect(existsSync(dir)).toBe(true)
    })
  })
})

describe('writeFileSyncInDir', () => {
  test('creates the directory before writing', () => {
    withTempDir(dir => {
      const folder = join(dir, 'deep', 'nested')
      FsHelpers.writeFileSyncInDir(folder, 'file.txt', 'content')
      expect(readFileSync(join(folder, 'file.txt'), 'utf8')).toBe('content')
    })
  })

  test('writes into the current directory when the folder is empty', () => {
    withTempDir(dir => {
      withCwd(dir, () => {
        FsHelpers.writeFileSyncInDir('', 'file.txt', 'content')
        expect(readFileSync(join(dir, 'file.txt'), 'utf8')).toBe('content')
      })
    })
  })
})

describe('stringToFolderFilenameAndExtension', () => {
  test('splits a path with folders', () => {
    expect(FsHelpers.stringToFolderFilenameAndExtension(join('a', 'b', 'c.json'))).toEqual({
      folder: join('a', 'b'), filename: 'c.json', extension: 'json'
    })
  })

  test('splits a bare filename', () => {
    expect(FsHelpers.stringToFolderFilenameAndExtension('licenses.ts')).toEqual({
      folder: '', filename: 'licenses.ts', extension: 'ts'
    })
  })

  test('reports an empty extension when there is none', () => {
    expect(FsHelpers.stringToFolderFilenameAndExtension('licenses')).toEqual({
      folder: '', filename: 'licenses', extension: ''
    })
  })

  test('handles a dotfile and a multi dot filename', () => {
    expect(FsHelpers.stringToFolderFilenameAndExtension('.npmrc').extension).toBe('')
    expect(FsHelpers.stringToFolderFilenameAndExtension('licenses.data.js').extension).toBe('js')
  })

  test('accepts forward slashes on every platform, Windows included', () => {
    // The README documents forward slashes; `path.win32.parse` accepts them too,
    // so the same CLI arguments work on macOS, Linux and Windows.
    const parsed = FsHelpers.stringToFolderFilenameAndExtension('out/sub/licenses.js')
    expect(parsed.filename).toBe('licenses.js')
    expect(parsed.extension).toBe('js')
    expect(win32.parse('out/sub/licenses.js').base).toBe('licenses.js')
    expect(win32.parse('out\\sub\\licenses.js').base).toBe('licenses.js')
  })
})

describe('readDirSafe', () => {
  test('lists entries with their kind', () => {
    withTempDir(dir => {
      writeFileSync(join(dir, 'a-file'), '')
      mkdirSync(join(dir, 'a-dir'))
      symlinkSync(join(dir, 'a-dir'), join(dir, 'a-link'), 'junction')

      const entries = FsHelpers.readDirSafe(dir).sort((x, y) => x.name.localeCompare(y.name))
      expect(entries.map(e => e.name)).toEqual(['a-dir', 'a-file', 'a-link'])
      expect(entries[0]).toEqual({ name: 'a-dir', isDirectory: true, isSymbolicLink: false })
      expect(entries[1]).toEqual({ name: 'a-file', isDirectory: false, isSymbolicLink: false })
      expect(entries[2].isSymbolicLink).toBe(true)
    })
  })

  test('returns an empty list instead of throwing', () => {
    withTempDir(dir => {
      expect(FsHelpers.readDirSafe(join(dir, 'missing'))).toEqual([])
      writeFileSync(join(dir, 'a-file'), '')
      // Reading a file as a directory must not crash the whole run.
      expect(FsHelpers.readDirSafe(join(dir, 'a-file'))).toEqual([])
    })
  })
})

describe('readFileSafe', () => {
  test('reads a file as utf8', () => {
    withTempDir(dir => {
      writeFileSync(join(dir, 'f.txt'), 'héllo')
      expect(FsHelpers.readFileSafe(join(dir, 'f.txt'))).toBe('héllo')
    })
  })

  test('returns null instead of throwing', () => {
    withTempDir(dir => {
      expect(FsHelpers.readFileSafe(join(dir, 'missing.txt'))).toBeNull()
      expect(FsHelpers.readFileSafe(dir)).toBeNull()
    })
  })
})
