import { resolve } from 'path'
import { argsParser } from './input/argsParser'
import { getLicenses } from './input/getLicenses'
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

  // First pass: index every license text we could find, so that a package
  // without its own license file can borrow the text of the same license from
  // another package regardless of the order they are visited in.
  for (const packageName in appPackages) {
    const packageData = appPackages[packageName]
    if (packageData.license && !licenses[packageData.licenses]) {
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

  const verifier = new Verifier(args.projectPath, packagesArray, !!args.outLicensesDir, !!args.outputJsonFile)
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
    LicensesData.saveToJsonAllPackagesUsedGroupedByLicense(packagesByLicense, args.outputJsonFile)
  }

  return verifier.result()
}

export { argsParser, getLicenses, LicensesData, Verifier }
export * from './types'
