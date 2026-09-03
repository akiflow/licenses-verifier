import { describe, expect, test } from 'bun:test'
import { execFileSync, spawnSync } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'
import * as h from './helpers'

const root = join(__dirname, '..')
const bin = join(root, 'bin', 'licenses-verifier.js')
const built = existsSync(join(root, 'dist', 'cli.js'))

/** The Node binary, not Bun: the package ships to npm and has to run under Node. */
const node = process.platform === 'win32' ? 'node.exe' : 'node'
const hasNode = (() => {
  const probe = spawnSync(node, ['--version'], { stdio: 'ignore' })
  return !probe.error && probe.status === 0
})()

function runBinary (args: Array<string>, cwd: string) {
  const result = spawnSync(node, [bin, ...args], { cwd, encoding: 'utf8' })
  return {
    code: result.status,
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`
  }
}

/**
 * These exercise the artifact that actually gets published: the compiled
 * `dist/`, reached through the real `bin` entry point, executed by Node.
 * Everything else in this suite tests the TypeScript sources under Bun.
 */
describe.if(built && hasNode)('the built package under Node', () => {
  test('runs on this repository and exits 0', () => {
    const { code, output } = runBinary([], root)
    expect(output).toContain('Analyzing project in directory')
    expect(output).toContain('whitelisted in package.json')
    expect(code).toBe(0)
  })

  test('exits 1 on a violation and 2 on bad usage', () => {
    h.withTempDir(dir => {
      h.writeProject(dir, { name: 'app', version: '1.0.0', license: 'MIT', whitelistedLicenses: ['MIT'] })
      h.writePackage(dir, 'copyleft', { license: 'GPL-3.0' }, { LICENSE: h.GPL3_TEXT })
      expect(runBinary([], dir).code).toBe(1)
      expect(runBinary(['--nonsense'], dir).code).toBe(2)
    })
  })

  test('prints the help and the version', () => {
    expect(runBinary(['--help'], root).output).toContain('Usage: licenses-verifier')
    expect(runBinary(['--version'], root).output.trim()).toBe(require('../package.json').version)
  })

  test('writes its output files', () => {
    h.withTempDir(dir => {
      h.writeProject(dir, { name: 'app', version: '1.0.0', license: 'MIT', whitelistedLicenses: ['MIT'] })
      h.writePackage(dir, 'dep', { license: 'MIT' }, { LICENSE: h.MIT_TEXT })
      const { code } = runBinary([
        '--tsOrJsFile=./out/licensesData.ts',
        '--outLicensesDir=./out',
        '--json=./out/byLicense.json'
      ], dir)
      expect(code).toBe(0)
      expect(existsSync(join(dir, 'out', 'licensesData.ts'))).toBe(true)
      expect(existsSync(join(dir, 'out', 'licenses', 'MIT.txt'))).toBe(true)
      expect(existsSync(join(dir, 'out', 'byLicense.json'))).toBe(true)
    })
  })

  test('can be required as a library without running the CLI', () => {
    const stdout = execFileSync(node, [
      '-e',
      `const lib = require(${JSON.stringify(join(root, 'dist', 'index.js'))});` +
      'console.log([typeof lib.start, typeof lib.getLicenses, typeof lib.Verifier].join(","))'
    ], { encoding: 'utf8' })
    // No report printed: importing the library must have no side effects.
    expect(stdout.trim()).toBe('function,function,function')
  })

  test('the published entry points exist', () => {
    const manifest = require('../package.json')
    for (const entry of [manifest.main, manifest.types, ...Object.values(manifest.bin) as Array<string>]) {
      expect(existsSync(join(root, entry))).toBe(true)
    }
  })
})
