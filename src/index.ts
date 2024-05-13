import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { argsParser, ILicensesVerifierCliOptions } from './input/argsParser'
import { getLicensesWithLicensesChecker, IModuleInfo } from './input/getLicensesWithLicensesChecker'
import { ILicensesTexts, IPackagesByLicense, LicensesData } from './output/LicensesData'
import { Verifier } from './output/Verifier'

export async function start (args: ILicensesVerifierCliOptions): Promise<void> {
  const projectFullPath = join(process.cwd(), args.projectPath)
  console.log(`\n[LicenseVerifier] - Analyzing project in directory ${projectFullPath}\n`)
  const appPackages = await getLicensesWithLicensesChecker(args)
  if (appPackages === null) {
    console.log(`[LicenseVerifier] ❗ No packages found in directory ${projectFullPath}.`)
    console.log('                     Try to pass a different directory with the arg \'--projectPath=[pathToDirectorry]\'.\n')
    return
  }
  const licenses: ILicensesTexts = {}
  const packagesByLicense: IPackagesByLicense = {}
  const separator = args.packages?.includes(',') ? ',' : ' '
  const packagesToLimit = args.packages ? args.packages.split(separator) : null

  let packagesWithLicense = 0
  const pckagesArray: Array<IModuleInfo> = []
  for (const packageName in appPackages) {
    const packageNameWithoutVersion = !packageName.startsWith('@') ? packageName.split('@')[0] : packageName.split('@').slice(0, -1).join('@')
    if (packagesToLimit && !packagesToLimit.includes(packageNameWithoutVersion)) {
      continue
    }
    const packageData = appPackages[packageName]
    packageData.name = packageName
    const pathToLicense = packageData.licenseFile

    if (!packagesByLicense[packageData.licenses]) {
      packagesByLicense[packageData.licenses] = []
    }
    packagesByLicense[packageData.licenses].push(packageData.name)

    if (pathToLicense) {
      const license = readFileSync(pathToLicense, 'utf8')
      packageData.license = license
      licenses[packageData.licenses] = license
      delete packageData.licenseFile
      // Some licenses require that also the NOTICE file is included
      if (existsSync(packageData.path + '/NOTICE')) {
        packageData.notice = readFileSync(packageData.path + '/NOTICE', 'utf8')
      } else if (existsSync(packageData.path + '/CopyrightNotice.txt')) {
        packageData.notice = readFileSync(packageData.path + '/CopyrightNotice.txt', 'utf8')
      }
      packagesWithLicense++
    } else {
      if (licenses[packageData.licenses]) {
        packageData.license = licenses[packageData.licenses]
        console.log(`  ⚠ No license file for package: ${packageName}. Using license from other package: ${packageData.licenses}`)
        packagesWithLicense++
      } else {
        console.log(`  ❗ No license file for package: ${packageName}. No license found for this package. ‼`)
      }
    }
    delete packageData.path
    pckagesArray.push(packageData)
  }

  const verifier = new Verifier(args.projectPath, pckagesArray, !!args.outLicensesDir, !!args.outputJsonFile)
  verifier.allPackagesHaveLicense(packagesWithLicense)
  verifier.allLicensesAreWithelistedInPackageDotJson()

  if (args.outputTsFile) {
    new LicensesData().exportLicensesToFileOfExtension(pckagesArray, args.outputTsFile, 'ts')
  }

  if (args.outputJsFile) {
    new LicensesData().exportLicensesToFileOfExtension(pckagesArray, args.outputJsFile, 'js')
  }

  if (args.outputJsonFile) {
    new LicensesData().exportLicensesToFileOfExtension(pckagesArray, args.outputJsonFile, 'json')
  }

  if (args.outLicensesDir) {
    LicensesData.saveAllLicencesToTxtFile(licenses, args.outLicensesDir)
  }

  if (args.packagesByLicense) {
    LicensesData.saveToJsonAllPackagesUsedGroupedByLicense(packagesByLicense, args.packagesByLicense)
  }
}

start(
  argsParser()
)
