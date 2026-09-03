#!/usr/bin/env node
'use strict'

// Zero-dependency, cross-platform `rm -rf dist` (no `rimraf`, no shell built-ins).
const { rmSync, existsSync } = require('fs')
const { join } = require('path')

const dist = join(__dirname, '..', 'dist')
if (existsSync(dist)) {
  rmSync(dist, { recursive: true, force: true })
}
