#!/usr/bin/env node
const yargs = require('yargs/yargs')
const { hideBin } = require('yargs/helpers')
const argv = yargs(hideBin(process.argv)).argv

export interface ILicensesVerifierCliOptions {
  projectPath: string
  outputTsOrJsFile?: string
  outLicensesDir?: string
  outputJsonFile?: string
  production?: boolean
  development?: boolean
}

export function argsParser (): ILicensesVerifierCliOptions {
  const projectPath = argv.projectPath || './'
  const outputTsOrJsFile = argv.tsOrJsFile
  const outLicensesDir = argv.outLicensesDir
  const outputJsonFile = argv.json
  const production = argv.production
  const development = argv.development
  return { projectPath, outputTsOrJsFile, outLicensesDir, outputJsonFile, production, development }
}
