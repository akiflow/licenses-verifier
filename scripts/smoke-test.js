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

const { copyFileSync, mkdtempSync, readdirSync, rmSync, writeFileSync } = require('fs')
const { join } = require('path')
const { tmpdir } = require('os')
const { runSync, trySync, tryBinarySync } = require('./exec')

const root = join(__dirname, '..')

/** The tarball is copied under this fixed, boring name inside each temp project. */
const TARBALL_NAME = 'package.tgz'

function isAvailable (name) {
  const probe = trySync(name, ['--version'], { stdio: 'ignore' })
  return !probe.error && probe.status === 0
}

/** Packs the tarball that would be published, using npm: that is what the registry gets. */
function pack () {
  runSync('npm', ['pack'], { cwd: root, stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' })
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

    // The tarball is installed from inside the project, by a relative path:
    // every argument then goes through a Windows shell unscathed, whatever the
    // temporary directory happens to be called.
    copyFileSync(tarball, join(temp, TARBALL_NAME))

    // Yarn caches a `file:` dependency under `name-version-<hash of the path>`,
    // so a rebuilt tarball at the same path is served from the cache and the
    // smoke test silently checks a stale build. A throwaway cache folder, wiped
    // with the temporary project, makes the run test what was just packed.
    const install = packageManager === 'yarn'
      ? ['add', `file:./${TARBALL_NAME}`, '--no-lockfile', '--silent', '--cache-folder', './.yarn-cache']
      : ['install', `./${TARBALL_NAME}`, '--no-audit', '--no-fund']
    runSync(packageManager, install, { cwd: temp, stdio: ['ignore', 'ignore', 'inherit'] })

    // Nothing but the tool itself may be installed.
    const unexpected = readdirSync(join(temp, 'node_modules'))
      .filter(name => !name.startsWith('.') && name !== '@akiflow')
    if (unexpected.length > 0) {
      problems.push(`installing the package pulled in dependencies: ${unexpected.join(', ')}`)
    }

    const result = tryBinarySync(temp, 'licenses-verifier', ['--json=./out/app-packages.json', '--jsonGroupedByLicense=./out/byLicense.json'], {
      cwd: temp,
      encoding: 'utf8'
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
