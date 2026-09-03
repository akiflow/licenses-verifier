import { join } from 'path'
import { CliUsageError, argsParser, helpText } from './input/argsParser'
import { readManifest } from './utils/manifest'
import { start } from './index'

const EXIT_OK = 0
const EXIT_VERIFICATION_FAILED = 1
const EXIT_USAGE_ERROR = 2

function version (): string {
  // `__dirname` is `<package>/dist`, so the manifest is one level up.
  const manifest = readManifest(join(__dirname, '..'))
  return (manifest && manifest.version) || 'unknown'
}

export function main (argv: Array<string> = process.argv.slice(2)): number {
  let args
  try {
    args = argsParser(argv)
  } catch (error) {
    if (error instanceof CliUsageError) {
      console.error(`\n[LicenseVerifier] ❗ ${error.message}\n`)
      return EXIT_USAGE_ERROR
    }
    throw error
  }

  if (args.help) {
    console.log(helpText())
    return EXIT_OK
  }
  if (args.version) {
    console.log(version())
    return EXIT_OK
  }

  const result = start(args)
  if (result === null) {
    return EXIT_USAGE_ERROR
  }
  return result.passed ? EXIT_OK : EXIT_VERIFICATION_FAILED
}

/** Runs the CLI and sets `process.exitCode`. Called by `bin/licenses-verifier.js`. */
export function run (argv?: Array<string>): void {
  try {
    process.exitCode = main(argv)
  } catch (error) {
    console.error(`\n[LicenseVerifier] \u2757 Unexpected error: ${(error as Error).message}\n`)
    process.exitCode = EXIT_USAGE_ERROR
  }
}

// Also support `node dist/cli.js` directly.
if (require.main === module) {
  run()
}
