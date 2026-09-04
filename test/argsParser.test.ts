import { describe, expect, test } from 'bun:test'
import { CliUsageError, argsParser, helpText } from '../src/input/argsParser'

describe('argsParser', () => {
  test('applies the documented defaults', () => {
    const args = argsParser([])
    expect(args).toEqual({
      projectPath: './',
      outputTsOrJsFile: undefined,
      outLicensesDir: undefined,
      outputJsonFile: undefined,
      outputGroupedJsonFile: undefined,
      production: undefined,
      development: undefined,
      help: false,
      version: false
    })
  })

  test('parses --key=value', () => {
    expect(argsParser(['--projectPath=../other']).projectPath).toBe('../other')
  })

  test('parses --key value', () => {
    expect(argsParser(['--projectPath', '../other']).projectPath).toBe('../other')
  })

  test('keeps a value containing an equals sign intact', () => {
    expect(argsParser(['--json=./out/a=b.json']).outputJsonFile).toBe('./out/a=b.json')
  })

  test('maps every value option', () => {
    const args = argsParser([
      '--projectPath=./p',
      '--tsOrJsFile=./out/licenses.ts',
      '--outLicensesDir=./out',
      '--json=./out/app-packages.json',
      '--jsonGroupedByLicense=./out/by-license.json'
    ])
    expect(args.projectPath).toBe('./p')
    expect(args.outputTsOrJsFile).toBe('./out/licenses.ts')
    expect(args.outLicensesDir).toBe('./out')
    expect(args.outputJsonFile).toBe('./out/app-packages.json')
    expect(args.outputGroupedJsonFile).toBe('./out/by-license.json')
  })

  test('accepts --outputJsonFile and --jsonFile as aliases of --json', () => {
    expect(argsParser(['--outputJsonFile=a.json']).outputJsonFile).toBe('a.json')
    expect(argsParser(['--jsonFile=a.json']).outputJsonFile).toBe('a.json')
    expect(argsParser(['--json=a.json']).outputJsonFile).toBe('a.json')
  })

  test('the last occurrence of an option wins', () => {
    expect(argsParser(['--projectPath=a', '--projectPath=b']).projectPath).toBe('b')
  })

  test('parses boolean flags', () => {
    expect(argsParser(['--production']).production).toBe(true)
    expect(argsParser(['--development']).development).toBe(true)
    expect(argsParser(['--production', '--development']).production).toBe(true)
  })

  test('parses explicit and negated boolean values', () => {
    expect(argsParser(['--production=true']).production).toBe(true)
    expect(argsParser(['--production=false']).production).toBe(false)
    expect(argsParser(['--no-production']).production).toBe(false)
  })

  test('supports the -h and -v short flags', () => {
    expect(argsParser(['-h']).help).toBe(true)
    expect(argsParser(['--help']).help).toBe(true)
    expect(argsParser(['-v']).version).toBe(true)
    expect(argsParser(['--version']).version).toBe(true)
  })

  test('stops parsing at a bare --', () => {
    expect(argsParser(['--production', '--', '--nonsense']).production).toBe(true)
  })

  test('reads process.argv when called with no arguments', () => {
    const original = process.argv
    process.argv = [original[0], 'cli.js', '--projectPath=./from-argv']
    try {
      expect(argsParser().projectPath).toBe('./from-argv')
    } finally {
      process.argv = original
    }
  })

  describe('rejects bad usage', () => {
    // Silently ignoring these would let a typo skip the check in a pipeline.
    const bad: Array<[string, Array<string>]> = [
      ['an unknown long option', ['--whatever']],
      ['a near miss of a real option', ['--projectPaht=./x']],
      ['an unknown short option', ['-x']],
      ['a positional argument', ['./somewhere']],
      ['a value option with no value', ['--projectPath']],
      ['a value option followed by another option', ['--projectPath', '--production']],
      ['a value option with an empty value', ['--projectPath=']],
      ['a negated value option', ['--no-projectPath']],
      ['a non boolean value for a flag', ['--production=yes']],
      ['a removed option', ['--no-fail']]
    ]

    for (const [description, argv] of bad) {
      test(description, () => {
        expect(() => argsParser(argv)).toThrow(CliUsageError)
      })
    }

    test('names the offending option in the message', () => {
      expect(() => argsParser(['--projectPaht=./x'])).toThrow(/--projectPaht/)
      expect(() => argsParser(['--projectPath'])).toThrow(/expects a value/)
      expect(() => argsParser(['--production=yes'])).toThrow(/'true' or 'false'/)
      expect(() => argsParser(['--no-projectPath'])).toThrow(/cannot be negated/)
      expect(() => argsParser(['./somewhere'])).toThrow(/must start with '--'/)
    })
  })
})

describe('helpText', () => {
  test('documents every option the parser accepts', () => {
    const text = helpText()
    for (const option of ['projectPath', 'tsOrJsFile', 'outLicensesDir', 'json', 'production', 'development', 'help', 'version']) {
      expect(text).toContain(`--${option}`)
    }
  })

  test('documents the exit codes and the usage line', () => {
    const text = helpText()
    expect(text).toContain('Usage: licenses-verifier')
    expect(text).toContain('whitelistedLicenses')
    expect(text).toContain('Exit codes')
  })

  test('does not mention an option the parser rejects', () => {
    expect(helpText()).not.toContain('--no-fail')
  })
})
