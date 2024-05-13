#!/usr/bin/env node
const yargs = require('yargs/yargs')
const { hideBin } = require('yargs/helpers')
const argv = yargs(hideBin(process.argv)).argv

export interface ILicensesVerifierCliOptions {
  projectPath: string
  outputTsFile?: string
  outputJsFile?: string
  outputJsonFile?: string
  outLicensesDir?: string
  packagesByLicense?: string
  packages?: string
  production?: boolean
  development?: boolean
  excludePrivatePackages?: boolean
}

export function argsParser (): ILicensesVerifierCliOptions {
  const projectPath = argv.projectPath || './'
  const outputTsFile = argv.tsFile
  const outputJsFile = argv.jsFile
  const outputJsonFile = argv.jsonFile
  const outLicensesDir = argv.outLicensesDir
  const packagesByLicense = argv.packagesByLicense
  const packages = argv.packages
  const production = !!argv.production || undefined
  const development = !!argv.development || undefined
  const excludePrivatePackages = !!argv.excludePrivatePackages || undefined
  return { projectPath, outputTsFile, outputJsFile, outputJsonFile, outLicensesDir, packagesByLicense, packages, production, development, excludePrivatePackages }
}
