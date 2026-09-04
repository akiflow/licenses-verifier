#!/usr/bin/env node
'use strict'

/**
 * Running `npm` and `yarn` from Node, on every platform.
 *
 * On Windows a package manager is a `.cmd` shim, and since the fix for
 * CVE-2024-27980 (Node 18.20.1, 20.12.1, 21.7.2 and every version after them)
 * `spawn` and `execFile` refuse to run a `.cmd` file unless they are told to go
 * through the shell: without it, every call fails with EINVAL.
 *
 * Going through the shell means `cmd.exe` parses the arguments, so callers must
 * keep them free of spaces and of shell metacharacters. Every caller here
 * passes literals and paths relative to `cwd`, which keeps that true.
 */

const { execFileSync, spawnSync } = require('child_process')
const { join } = require('path')

const isWindows = process.platform === 'win32'

/** The name a package manager has to be invoked by on this platform. */
function command (name) {
  return isWindows ? `${name}.cmd` : name
}

/** Runs a package manager, throwing when it fails. */
function runSync (name, args, options = {}) {
  return execFileSync(command(name), args, { ...options, shell: isWindows })
}

/** Runs a package manager, returning the result rather than throwing. */
function trySync (name, args, options = {}) {
  return spawnSync(command(name), args, { ...options, shell: isWindows })
}

/**
 * Runs an installed binary from `<projectDir>/node_modules/.bin`, which is also
 * a `.cmd` shim on Windows. The path is quoted, because it is the one argument
 * here that is not under our control.
 */
function tryBinarySync (projectDir, name, args, options = {}) {
  const binary = join(projectDir, 'node_modules', '.bin', isWindows ? `${name}.cmd` : name)
  return spawnSync(isWindows ? `"${binary}"` : binary, args, { ...options, shell: isWindows })
}

module.exports = { isWindows, command, runSync, trySync, tryBinarySync }
