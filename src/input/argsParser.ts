import { ILicensesVerifierCliOptions } from '../types'

export class CliUsageError extends Error {}

interface IOptionDefinition {
  /** Canonical flag name, without leading dashes */
  name: string
  aliases?: Array<string>
  type: 'string' | 'boolean'
  description: string
  placeholder?: string
}

const OPTIONS: Array<IOptionDefinition> = [
  {
    name: 'projectPath',
    type: 'string',
    placeholder: '<path>',
    description: 'Directory of the project to analyze. Defaults to the current directory.'
  },
  {
    name: 'tsOrJsFile',
    type: 'string',
    placeholder: '<pathAndFilename>',
    description: 'Write a .ts or .js module exporting every package and its license.'
  },
  {
    name: 'outLicensesDir',
    type: 'string',
    placeholder: '<directory>',
    description: 'Write one text file per license into <directory>/licenses.'
  },
  {
    name: 'json',
    aliases: ['outputJsonFile'],
    type: 'string',
    placeholder: '<pathAndFilename>',
    description: 'Write a JSON file listing all packages grouped by license.'
  },
  {
    name: 'production',
    type: 'boolean',
    description: 'Only check production dependencies.'
  },
  {
    name: 'development',
    type: 'boolean',
    description: 'Only check development dependencies.'
  },
  {
    name: 'help',
    aliases: ['h'],
    type: 'boolean',
    description: 'Show this help.'
  },
  {
    name: 'version',
    aliases: ['v'],
    type: 'boolean',
    description: 'Show the version of licenses-verifier.'
  }
]

function findOption (name: string): IOptionDefinition | null {
  for (const option of OPTIONS) {
    if (option.name === name || (option.aliases || []).includes(name)) {
      return option
    }
  }
  return null
}

export function helpText (): string {
  const lines = [
    'Usage: licenses-verifier [options]',
    '',
    'Verifies that the dependencies of a project are licensed in a way that',
    'allows their use, by checking them against the "whitelistedLicenses"',
    'array of the project package.json.',
    '',
    'Options:'
  ]
  for (const option of OPTIONS) {
    const flag = `  --${option.name}${option.placeholder ? `=${option.placeholder}` : ''}`
    lines.push(flag)
    lines.push(`      ${option.description}`)
  }
  lines.push('')
  lines.push('Exit codes: 0 = verification passed, 1 = verification failed, 2 = bad usage.')
  return lines.join('\n')
}

export interface IParsedArgs extends ILicensesVerifierCliOptions {
  help: boolean
  version: boolean
}

/**
 * Parses `process.argv`-style arguments.
 *
 * Supports `--flag`, `--no-flag`, `--key=value` and `--key value`. Unknown
 * flags are rejected rather than ignored, so a typo in a CI pipeline fails
 * loudly instead of silently skipping a check.
 */
export function argsParser (argv: Array<string> = process.argv.slice(2)): IParsedArgs {
  const values: Record<string, string | boolean> = {}

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]

    if (arg === '--') {
      break
    }
    if (!arg.startsWith('-')) {
      throw new CliUsageError(`Unexpected argument '${arg}'. All options must start with '--'.`)
    }

    const withoutDashes = arg.replace(/^--?/, '')
    const equalsAt = withoutDashes.indexOf('=')
    const rawName = equalsAt === -1 ? withoutDashes : withoutDashes.slice(0, equalsAt)
    const inlineValue = equalsAt === -1 ? null : withoutDashes.slice(equalsAt + 1)

    const negated = rawName.startsWith('no-')
    const name = negated ? rawName.slice(3) : rawName
    const option = findOption(name)

    if (option === null) {
      throw new CliUsageError(`Unknown option '${arg}'. Run 'licenses-verifier --help' to see the available options.`)
    }

    if (option.type === 'boolean') {
      if (inlineValue !== null) {
        if (inlineValue !== 'true' && inlineValue !== 'false') {
          throw new CliUsageError(`Option '--${option.name}' is a flag and only accepts 'true' or 'false', got '${inlineValue}'.`)
        }
        values[option.name] = inlineValue === 'true'
      } else {
        values[option.name] = !negated
      }
      continue
    }

    if (negated) {
      throw new CliUsageError(`Option '--${option.name}' expects a value and cannot be negated.`)
    }

    let value = inlineValue
    if (value === null) {
      const next = argv[index + 1]
      if (next === undefined || next.startsWith('-')) {
        throw new CliUsageError(`Option '--${option.name}' expects a value, e.g. --${option.name}=${option.placeholder || '<value>'}.`)
      }
      value = next
      index++
    }
    if (!value) {
      throw new CliUsageError(`Option '--${option.name}' expects a non empty value.`)
    }
    values[option.name] = value
  }

  const asString = (name: string): string | undefined => {
    const value = values[name]
    return typeof value === 'string' ? value : undefined
  }
  const asBoolean = (name: string): boolean | undefined => {
    const value = values[name]
    return typeof value === 'boolean' ? value : undefined
  }

  return {
    projectPath: asString('projectPath') || './',
    outputTsOrJsFile: asString('tsOrJsFile'),
    outLicensesDir: asString('outLicensesDir'),
    outputJsonFile: asString('json'),
    production: asBoolean('production'),
    development: asBoolean('development'),
    help: asBoolean('help') === true,
    version: asBoolean('version') === true
  }
}
