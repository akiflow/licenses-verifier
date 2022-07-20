import { readFileSync, existsSync } from 'fs'
import { getLicensesWithLicensesChecker, IModuleInfo } from './input/getLicensesWithLicensesChecker'
import { IPackagesByLicense, LicensesData } from './output/LicensesData'
import { ILicensesTexts, LicensesFiles } from './output/LicensesFiles'
import { Verifier } from './output/Verifier'

export async function start (inputPath: string, outputPath: string) {
  console.log('[LicenseVerifier] - Building list of packages with licenses:')
  const appPackages = await getLicensesWithLicensesChecker(inputPath)
  if (appPackages === null) {
    console.log(`[LicenseVerifier] ❗No packages found in path ${inputPath}`)
    return
  }
  const licenses: ILicensesTexts = {}
  const packagesByLicense: IPackagesByLicense = {}

  let packagesWithLicense = 0
  const pckagesArray: Array<IModuleInfo> = []
  for (const packageName in appPackages) {
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

  const verifier = new Verifier(inputPath, pckagesArray)
  verifier.allPackagesHaveLicense(packagesWithLicense)
  verifier.allLicensesAreWithelistedInPackageDotJson()

  new LicensesData().exportLicensesToTsOrJsFile(pckagesArray, `${outputPath}/licensesData.ts`)

  LicensesFiles.saveAllLicencesToTxtFile(licenses, outputPath)

  LicensesData.saveToJsonAllPackagesUsedGroupedByLicense(packagesByLicense, outputPath)
}

start('./', './output-licenses-verifier')
