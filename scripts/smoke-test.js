#!/usr/bin/env node
'use strict'

/**
 * Installs the packed tarball into a throwaway project and runs the installed
 * binary, once per available package manager, on whatever platform this happens
 * to be running on.
 *
 * This is the check that version 2.0.1 needed and did not have: the published
 * tarball contained no runnable JavaScript, so `licenses-verifier` failed with
 * MODULE_NOT_FOUND for everyone who installed it.
 */

const { execFileSync, spawnSync } = require('child_process')
const { mkdtempSync, readdirSync, renameSync, rmSync, writeFileSync } = require('fs')
const { join } = require('path')
const { tmpdir } = require('os')

const root = join(__dirname, '..')
const isWindows = process.platform === 'win32'

/** On Windows these are .cmd shims, which execFileSync needs by their real name. */
function command (name) {
  return isWindows ? `${name}.cmd` : name
}

function isAvailable (name) {
  const probe = spawnSync(command(name), ['--version'], { stdio: 'ignore' })
  return !probe.error && probe.status === 0
}

/** Packs the tarball that would be published, using npm: that is what the registry gets. */
function pack () {
  execFileSync(command('npm'), ['pack'], { cwd: root, stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' })
  const tarball = readdirSync(root).find(name => name.endsWith('.tgz'))
  if (!tarball) {
    throw new Error('npm pack produced no tarball')
  }
  return join(root, tarball)
}

function verifyWith (packageManager, tarball) {
  const temp = mkdtempSync(join(tmpdir(), `licenses-verifier-smoke-${packageManager}-`))
  const problems = []
  try {
    writeFileSync(join(temp, 'package.json'), JSON.stringify({
      name: 'smoke-test-project',
      version: '1.0.0',
      private: true,
      license: 'MIT',
      whitelistedLicenses: ['MIT']
    }, null, 2))

    const install = packageManager === 'yarn'
      ? ['add', `file:${tarball}`, '--no-lockfile', '--silent']
      : ['install', tarball, '--no-audit', '--no-fund']
    execFileSync(command(packageManager), install, { cwd: temp, stdio: ['ignore', 'ignore', 'inherit'] })

    // Nothing but the tool itself may be installed.
    const unexpected = readdirSync(join(temp, 'node_modules'))
      .filter(name => !name.startsWith('.') && name !== '@akiflow')
    if (unexpected.length > 0) {
      problems.push(`installing the package pulled in dependencies: ${unexpected.join(', ')}`)
    }

    const binary = join(temp, 'node_modules', '.bin', isWindows ? 'licenses-verifier.cmd' : 'licenses-verifier')
    const result = spawnSync(binary, ['--json=./out/byLicense.json'], {
      cwd: temp,
      encoding: 'utf8',
      shell: isWindows
    })
    const output = `${result.stdout || ''}${result.stderr || ''}`

    if (result.error) {
      problems.push(`could not run the installed binary: ${result.error.message}`)
    }
    if (!output.includes('Analyzing project in directory')) {
      problems.push(`the installed binary did not produce the expected report:\n${output}`)
    }
    if (!output.includes('All licenses used in this project are whitelisted')) {
      problems.push(`the installed binary did not complete the verification:\n${output}`)
    }
    if (result.status !== 0) {
      problems.push(`the installed binary exited with ${result.status}, expected 0`)
    }
  } finally {
    rmSync(temp, { recursive: true, force: true })
  }
  return problems
}

const tarball = pack()
const problems = []
try {
  for (const packageManager of ['npm', 'yarn']) {
    if (!isAvailable(packageManager)) {
      console.log(`[smoke-test] - ${packageManager} not available, skipped`)
      continue
    }
    const found = verifyWith(packageManager, tarball)
    problems.push(...found.map(problem => `${packageManager}: ${problem}`))
    console.log(`[smoke-test] ${found.length === 0 ? '✔' : '❗'} installed and ran with ${packageManager}`)
  }
} finally {
  rmSync(tarball, { force: true })
}

if (problems.length > 0) {
  console.error('\n[smoke-test] ❗ the packed tarball is not usable:\n')
  for (const problem of problems) {
    console.error(`  - ${problem}`)
  }
  console.error('')
  process.exit(1)
}

console.log('[smoke-test] ✔ the published tarball installs and runs with zero dependencies')
