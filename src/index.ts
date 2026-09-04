import { resolve } from 'path'
import { argsParser } from './input/argsParser'
import { getLicenses } from './input/getLicenses'
import { namesAnActualLicense } from './input/licenseResolver'
import { LicensesData } from './output/LicensesData'
import { Verifier } from './output/Verifier'
import {
  ILicensesTexts,
  ILicensesVerifierCliOptions,
  IModuleInfo,
  IPackagesByLicense,
  IVerificationResult
} from './types'

/**
 * Runs the verification. Resolves to null when no project was found at the
 * given path, which the CLI reports as a hint to pass `--projectPath`.
 */
export function start (args: ILicensesVerifierCliOptions): IVerificationResult | null {
  const projectFullPath = resolve(process.cwd(), args.projectPath)
  console.log(`\n[LicenseVerifier] - Analyzing project in directory ${projectFullPath}\n`)

  const appPackages = getLicenses(args)
  if (appPackages === null) {
    console.log(`[LicenseVerifier] ❗ No packages found in directory ${projectFullPath}.`)
    console.log('                     Try to pass a different directory with the arg \'--projectPath=[pathToDirectory]\'.\n')
    return null
  }

  const licenses: ILicensesTexts = {}
  const packagesByLicense: IPackagesByLicense = {}
  const packagesArray: Array<IModuleInfo> = []

  // First pass: index the text of every license we could find, so that a package
  // without its own license file can borrow the text of the same license from
  // another package regardless of the order they are visited in.
  //
  // Only real licenses are indexed. `UNKNOWN`, `UNLICENSED` and
  // `SEE LICENSE IN <file>` are placeholders, not licenses: two packages sharing
  // one of them share no terms, so lending the text of one to the other would
  // publish a license grant that was never made.
  for (const packageName in appPackages) {
    const packageData = appPackages[packageName]
    if (packageData.license && !licenses[packageData.licenses] && namesAnActualLicense(packageData.licenses)) {
      licenses[packageData.licenses] = packageData.license
    }
  }

  const packagesWithoutLicense: Array<string> = []
  for (const packageName in appPackages) {
    const packageData = appPackages[packageName]

    if (!packagesByLicense[packageData.licenses]) {
      packagesByLicense[packageData.licenses] = []
    }
    packagesByLicense[packageData.licenses].push(packageData.name)

    if (!packageData.license) {
      const sharedLicenseText = licenses[packageData.licenses]
      if (sharedLicenseText) {
        packageData.license = sharedLicenseText
        console.log(`  ⚠ No license file for package: ${packageName}. Using license from other package: ${packageData.licenses}`)
      } else {
        packagesWithoutLicense.push(packageName)
        console.log(`  ❗ No license file for package: ${packageName}. No license found for this package. ‼`)
      }
    }

    delete packageData.licenseFile
    delete packageData.path
    packagesArray.push(packageData)
  }

  // Sorted by `name@version` so that regenerating the outputs on a different
  // machine produces the same file, and a diff only shows real changes.
  packagesArray.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  for (const license in packagesByLicense) {
    packagesByLicense[license].sort()
  }

  const hasJsonOutput = !!args.outputJsonFile || !!args.outputGroupedJsonFile
  const verifier = new Verifier(args.projectPath, packagesArray, !!args.outLicensesDir, hasJsonOutput)
  verifier.allPackagesHaveLicense(packagesWithoutLicense)
  verifier.noPackageHasAnUnknownLicense()
  verifier.allLicensesAreWithelistedInPackageDotJson()

  if (args.outputTsOrJsFile) {
    new LicensesData().exportLicensesToTsOrJsFile(packagesArray, args.outputTsOrJsFile)
  }

  if (args.outLicensesDir) {
    LicensesData.saveAllLicencesToTxtFile(licenses, args.outLicensesDir)
  }

  if (args.outputJsonFile) {
    LicensesData.saveToJsonAllPackages(packagesArray, args.outputJsonFile)
  }

  if (args.outputGroupedJsonFile) {
    LicensesData.saveToJsonAllPackagesUsedGroupedByLicense(packagesByLicense, args.outputGroupedJsonFile)
  }

  return verifier.result()
}

export { argsParser, getLicenses, LicensesData, Verifier }
export * from './types'
