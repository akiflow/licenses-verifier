import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import type { IManifest } from '../src/utils/manifest'

export interface ITempDir {
  dir: string
  cleanup: () => void
}

/** Creates an isolated temporary directory. */
export function makeTempDir (): ITempDir {
  const dir = mkdtempSync(join(tmpdir(), 'lv-test-'))
  return {
    dir,
    cleanup () {
      rmSync(dir, { recursive: true, force: true })
    }
  }
}

/**
 * Runs `body` with a fresh temporary directory, removed afterwards even when
 * the assertions throw.
 */
export function withTempDir<T> (body: (dir: string) => T): T {
  const temp = makeTempDir()
  try {
    return body(temp.dir)
  } finally {
    temp.cleanup()
  }
}

export type IFiles = Record<string, string>

/** Writes `<root>/package.json`. */
export function writeProject (root: string, manifest: Record<string, unknown>): string {
  mkdirSync(root, { recursive: true })
  writeFileSync(join(root, 'package.json'), JSON.stringify(manifest, null, 2))
  return root
}

/**
 * Writes a package into `<root>/node_modules/<name>`. Pass a package directory
 * as `root` to build a nested layout.
 */
export function writePackage (root: string, name: string, manifest: IManifest = {}, files: IFiles = {}): string {
  const dir = join(root, 'node_modules', ...name.split('/'))
  mkdirSync(dir, { recursive: true })
  const merged: Record<string, unknown> = { name, version: '1.0.0', ...manifest }
  if (manifest.name === undefined && name.includes('/')) {
    merged.name = name
  }
  writeFileSync(join(dir, 'package.json'), JSON.stringify(merged, null, 2))
  writeFiles(dir, files)
  return dir
}

/** Writes a package directory with no `node_modules` wrapper. */
export function writeBarePackage (dir: string, manifest: Record<string, unknown>, files: IFiles = {}): string {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify(manifest, null, 2))
  writeFiles(dir, files)
  return dir
}

export function writeFiles (dir: string, files: IFiles): void {
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(dir, name), content)
  }
}

export interface ICaptured<T> {
  result: T
  /** Everything written to console.log */
  out: string
  /** Everything written to console.error */
  err: string
  /** console.log and console.error interleaved */
  all: string
}

/**
 * Runs `body` with `console.log` and `console.error` captured, so that the test
 * output stays readable and the reported messages can be asserted on.
 */
export function captureConsole<T> (body: () => T): ICaptured<T> {
  const originalLog = console.log
  const originalError = console.error
  const out: Array<string> = []
  const err: Array<string> = []
  const all: Array<string> = []

  console.log = (...args: Array<unknown>) => {
    const line = args.map(String).join(' ')
    out.push(line)
    all.push(line)
  }
  console.error = (...args: Array<unknown>) => {
    const line = args.map(String).join(' ')
    err.push(line)
    all.push(line)
  }

  try {
    const result = body()
    return { result, out: out.join('\n'), err: err.join('\n'), all: all.join('\n') }
  } finally {
    console.log = originalLog
    console.error = originalError
  }
}

/** Runs `body` with `process.cwd()` temporarily pointing at `dir`. */
export function withCwd<T> (dir: string, body: () => T): T {
  const original = process.cwd()
  process.chdir(dir)
  try {
    return body()
  } finally {
    process.chdir(original)
  }
}

export const MIT_TEXT = `MIT License

Copyright (c) 2024 Someone

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.
`

export const ISC_TEXT = `ISC License

Copyright (c) 2024 Someone

Permission to use, copy, modify, and/or distribute this software for any purpose
with or without fee is hereby granted, provided that the above copyright notice
and this permission notice appear in all copies.
`

export const ZERO_BSD_TEXT = `Zero-Clause BSD

Permission to use, copy, modify, and/or distribute this software for any purpose
with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES.
`

export const APACHE_TEXT = `                                 Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/
`

export const BSD3_TEXT = `Copyright (c) 2024 Someone
Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:
1. Redistributions must reproduce the above copyright notice.
2. Neither the name of the copyright holder nor the names of its contributors
   may be used to endorse or promote products derived from this software.
`

export const BSD2_TEXT = `Copyright (c) 2024 Someone
Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:
1. Redistributions of source code must reproduce the above copyright notice.
2. Redistributions in binary form must reproduce the above copyright notice.
`

export const BSD4_TEXT = `Copyright (c) 2024 Someone
Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:
All advertising materials mentioning features or use of this software must
display the following acknowledgement.
`

export const GPL3_TEXT = `                    GNU GENERAL PUBLIC LICENSE
                       Version 3, 29 June 2007
`
