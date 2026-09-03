#!/usr/bin/env node
'use strict'

/**
 * Guards the two mistakes that shipped a broken package to npm before:
 *
 *  1. publishing without a build, so the tarball contains no runnable JS;
 *  2. gaining a runtime dependency, which is the whole point of this rewrite.
 *
 * Runs as part of `prepublishOnly`, and is safe to run in CI.
 */

const { execFileSync } = require('child_process')
const { existsSync } = require('fs')
const { join } = require('path')

const root = join(__dirname, '..')
const manifest = require(join(root, 'package.json'))
const problems = []

const DEPENDENCY_FIELDS = ['dependencies', 'peerDependencies', 'optionalDependencies', 'bundledDependencies', 'bundleDependencies']
for (const field of DEPENDENCY_FIELDS) {
  const value = manifest[field]
  const count = Array.isArray(value) ? value.length : Object.keys(value || {}).length
  if (count > 0) {
    problems.push(`package.json declares ${count} '${field}'. This package must have zero runtime dependencies.`)
  }
}

if (manifest.resolutions) {
  problems.push('package.json declares \'resolutions\', which npm ignores for consumers. Remove it: with zero dependencies it is not needed.')
}

// Every entry point must exist on disk, or the published package cannot start.
const entryPoints = [manifest.main, manifest.types].concat(Object.values(manifest.bin || {}))
for (const entry of entryPoints) {
  if (!entry) {
    continue
  }
  if (!existsSync(join(root, entry))) {
    problems.push(`Entry point '${entry}' does not exist. Run 'npm run build' before publishing.`)
  }
}

// Ask npm what would actually be published, and check the tarball is complete.
let packed
try {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  packed = JSON.parse(execFileSync(npm, ['pack', '--dry-run', '--json'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }))
} catch (error) {
  problems.push(`Could not run 'npm pack --dry-run': ${error.message}`)
}

if (packed && packed[0]) {
  const files = packed[0].files.map(file => file.path.split('\\').join('/'))
  const required = entryPoints.filter(Boolean).map(entry => entry.replace(/^\.\//, ''))
  for (const entry of required) {
    if (!files.includes(entry)) {
      problems.push(`'${entry}' is not included in the published files. Check the 'files' field of package.json.`)
    }
  }
  const sources = files.filter(file => file.startsWith('src/') || file.endsWith('.ts') && !file.endsWith('.d.ts'))
  if (sources.length > 0) {
    problems.push(`The tarball contains TypeScript sources (${sources.join(', ')}). Publish the build output only.`)
  }
  console.log(`[verify-package] tarball: ${files.length} files, ${(packed[0].unpackedSize / 1024).toFixed(1)} kB unpacked`)
}

if (problems.length > 0) {
  console.error('\n[verify-package] \u2757 The package is not ready to be published:\n')
  for (const problem of problems) {
    console.error(`  - ${problem}`)
  }
  console.error('')
  process.exitCode = 1
} else {
  console.log('[verify-package] \u2714 Zero runtime dependencies, all entry points present in the tarball.')
}
