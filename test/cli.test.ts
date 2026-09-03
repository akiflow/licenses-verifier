import { afterEach, describe, expect, test } from 'bun:test'
import { existsSync } from 'fs'
import { join } from 'path'
import { main, run } from '../src/cli'
import * as h from './helpers'

const EXIT_OK = 0
const EXIT_VERIFICATION_FAILED = 1
const EXIT_USAGE_ERROR = 2

function compliantProject (dir: string) {
  h.writeProject(dir, { name: 'app', version: '1.0.0', license: 'MIT', whitelistedLicenses: ['MIT'] })
  h.writePackage(dir, 'dep', { license: 'MIT' }, { LICENSE: h.MIT_TEXT })
  return dir
}

function violatingProject (dir: string) {
  h.writeProject(dir, { name: 'app', version: '1.0.0', license: 'MIT', whitelistedLicenses: ['MIT'] })
  h.writePackage(dir, 'copyleft', { license: 'GPL-3.0' }, { LICENSE: h.GPL3_TEXT })
  return dir
}

afterEach(() => {
  process.exitCode = 0
})

describe('main', () => {
  test('exits 0 and reports success when every license is whitelisted', () => {
    h.withTempDir(dir => {
      compliantProject(dir)
      const { result, out } = h.captureConsole(() => main([`--projectPath=${dir}`]))
      expect(result).toBe(EXIT_OK)
      expect(out).toContain('✔ All licenses used in this project are whitelisted')
    })
  })

  test('exits 1 when a license is not whitelisted', () => {
    h.withTempDir(dir => {
      violatingProject(dir)
      const { result, out } = h.captureConsole(() => main([`--projectPath=${dir}`]))
      expect(result).toBe(EXIT_VERIFICATION_FAILED)
      expect(out).toContain('not whitelisted')
      expect(out).toContain('GPL-3.0')
    })
  })

  test('exits 1 when a license cannot be determined, even if UNKNOWN is whitelisted', () => {
    h.withTempDir(dir => {
      h.writeProject(dir, { name: 'app', version: '1.0.0', license: 'MIT', whitelistedLicenses: ['MIT', 'UNKNOWN'] })
      h.writePackage(dir, 'mystery')
      const { result, out } = h.captureConsole(() => main([`--projectPath=${dir}`]))
      expect(result).toBe(EXIT_VERIFICATION_FAILED)
      expect(out).toContain('undeterminable license')
    })
  })

  test('exits 0 when a package ships no license text but declares its license', () => {
    h.withTempDir(dir => {
      compliantProject(dir)
      h.writePackage(dir, 'terse', { license: 'MIT' })
      const { result, out } = h.captureConsole(() => main([`--projectPath=${dir}`]))
      expect(result).toBe(EXIT_OK)
      expect(out).toContain('⚠ No license file for package: terse@1.0.0')
    })
  })

  test('exits 0 with a warning when the project declares no whitelist', () => {
    h.withTempDir(dir => {
      h.writeProject(dir, { name: 'app', version: '1.0.0', license: 'MIT' })
      h.writePackage(dir, 'copyleft', { license: 'GPL-3.0' }, { LICENSE: h.GPL3_TEXT })
      const { result, out } = h.captureConsole(() => main([`--projectPath=${dir}`]))
      expect(result).toBe(EXIT_OK)
      expect(out).toContain("No 'whitelistedLicenses' property found")
    })
  })

  test('exits 2 on an unknown option, without running the check', () => {
    h.withTempDir(dir => {
      violatingProject(dir)
      const { result, err, out } = h.captureConsole(() => main(['--projectPaht=.']))
      expect(result).toBe(EXIT_USAGE_ERROR)
      expect(err).toContain('Unknown option')
      expect(err).toContain('--help')
      expect(out).not.toContain('Analyzing project')
    })
  })

  test('exits 2 for every other kind of bad usage', () => {
    for (const argv of [['./positional'], ['--projectPath'], ['--production=yes'], ['--no-fail']]) {
      const { result } = h.captureConsole(() => main(argv))
      expect(result).toBe(EXIT_USAGE_ERROR)
    }
  })

  test('exits 2 when the given path holds no project', () => {
    h.withTempDir(dir => {
      const { result, out } = h.captureConsole(() => main([`--projectPath=${join(dir, 'nowhere')}`]))
      expect(result).toBe(EXIT_USAGE_ERROR)
      expect(out).toContain('No packages found in directory')
    })
  })

  test('--help prints the usage and exits 0 without checking anything', () => {
    h.withTempDir(dir => {
      violatingProject(dir)
      const { result, out } = h.captureConsole(() => main(['--help', `--projectPath=${dir}`]))
      expect(result).toBe(EXIT_OK)
      expect(out).toContain('Usage: licenses-verifier')
      expect(out).not.toContain('Analyzing project')
    })
  })

  test('--version prints this package version and exits 0', () => {
    const { result, out } = h.captureConsole(() => main(['--version']))
    expect(result).toBe(EXIT_OK)
    expect(out.trim()).toMatch(/^\d+\.\d+\.\d+/)
    expect(out.trim()).toBe(require('../package.json').version)
  })

  test('--help wins over --version', () => {
    const { out } = h.captureConsole(() => main(['--help', '--version']))
    expect(out).toContain('Usage: licenses-verifier')
  })

  test('passes the output options through', () => {
    h.withTempDir(dir => {
      compliantProject(dir)
      const { result } = h.captureConsole(() => main([
        `--projectPath=${dir}`,
        `--tsOrJsFile=${join(dir, 'out', 'licensesData.ts')}`,
        `--outLicensesDir=${join(dir, 'out')}`,
        `--json=${join(dir, 'out', 'byLicense.json')}`
      ]))
      expect(result).toBe(EXIT_OK)
      expect(existsSync(join(dir, 'out', 'licensesData.ts'))).toBe(true)
      expect(existsSync(join(dir, 'out', 'licenses', 'MIT.txt'))).toBe(true)
      expect(existsSync(join(dir, 'out', 'byLicense.json'))).toBe(true)
    })
  })

  test('lets an error that is not a usage error through, rather than reporting bad usage', () => {
    // A parser failure that is not about the arguments is a real defect: it must
    // not be reported to the user as if they had typed something wrong.
    const exploding = new Proxy([] as Array<string>, {
      get (target, property) {
        if (property === 'length') {
          throw new TypeError('argv exploded')
        }
        return Reflect.get(target, property)
      }
    })
    expect(() => main(exploding)).toThrow(/argv exploded/)
  })

  test('reads process.argv when given no arguments', () => {
    h.withTempDir(dir => {
      compliantProject(dir)
      const original = process.argv
      process.argv = [original[0], 'cli.js', `--projectPath=${dir}`]
      try {
        const { result } = h.captureConsole(() => main())
        expect(result).toBe(EXIT_OK)
      } finally {
        process.argv = original
      }
    })
  })
})

describe('run', () => {
  test('sets process.exitCode from the outcome', () => {
    h.withTempDir(dir => {
      compliantProject(dir)
      h.captureConsole(() => run([`--projectPath=${dir}`]))
      expect(process.exitCode).toBe(EXIT_OK)
    })

    h.withTempDir(dir => {
      violatingProject(dir)
      h.captureConsole(() => run([`--projectPath=${dir}`]))
      expect(process.exitCode).toBe(EXIT_VERIFICATION_FAILED)
    })
  })

  test('reports an error that is not a usage error as an unexpected error', () => {
    const exploding = new Proxy([] as Array<string>, {
      get (target, property) {
        if (property === 'length') {
          throw new TypeError('argv exploded')
        }
        return Reflect.get(target, property)
      }
    })
    const { err } = h.captureConsole(() => run(exploding))
    expect(process.exitCode).toBe(EXIT_USAGE_ERROR)
    expect(err).toContain('Unexpected error')
    expect(err).toContain('argv exploded')
  })

  test('turns an unexpected error into exit code 2 rather than a stack trace', () => {
    // A directory the process cannot read is the realistic way this happens.
    const originalCwd = process.cwd
    process.cwd = () => {
      throw new Error('cwd exploded')
    }
    try {
      const { err } = h.captureConsole(() => run([]))
      expect(process.exitCode).toBe(EXIT_USAGE_ERROR)
      expect(err).toContain('Unexpected error')
      expect(err).toContain('cwd exploded')
    } finally {
      process.cwd = originalCwd
    }
  })
})
