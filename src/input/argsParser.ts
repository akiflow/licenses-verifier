#!/usr/bin/env node
const yargs = require('yargs/yargs')
const { hideBin } = require('yargs/helpers')
const argv = yargs(hideBin(process.argv)).argv

export interface ILicensesVerifierCliOptions {
  projectPath: string
  outputTsOrJsFile?: string
  outLicensesDir?: string
  outputJsonFile?: string
}

export function argsParser (): ILicensesVerifierCliOptions {
  const projectPath = argv.projectPath || './'
  const outputTsOrJsFile = argv.tsOrJsFile
  const outLicensesDir = argv.outLicensesDir
  const outputJsonFile = argv.json
  return { projectPath, outputTsOrJsFile, outLicensesDir, outputJsonFile }
}
