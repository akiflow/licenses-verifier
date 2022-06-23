import { readFileSync, existsSync, writeFileSync, unlinkSync, mkdirSync } from 'fs'
import { join } from 'path'
import { FsHelpers } from './FsHelpers'
import { getLicensesWithLicensesChecker, ModuleInfo } from './input/getLicensesWithLicensesChecker'
import { IPackagesByLicense, LicensesData } from './output/LicensesData'
import { ILicensesTexts, LicensesFiles } from './output/LicensesFiles'

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
  const pckagesArray: Array<ModuleInfo> = []
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
        console.log(`  ❗ No license file for package: ${packageName}. Using license from other package: ${packageData.licenses}`)
        packagesWithLicense++
      } else {
        console.log(`  ‼ No license file for package: ${packageName}. No license found for this package. ‼`)
      }
    }
    delete packageData.path
    pckagesArray.push(packageData)
  }
  const numberOfPackages = pckagesArray.length
  
  if (numberOfPackages === packagesWithLicense) {
    console.log(`  ✔ All ${numberOfPackages} packages have a license, all is good.`)
  } else {
    console.log(`  ‼ ${numberOfPackages - packagesWithLicense} packages do not have a license, please check the output.`)
  }

  new LicensesData().exportLicensesData(pckagesArray, outputPath)
  
  LicensesFiles.saveLicencesToFile(licenses, outputPath)

  LicensesData.saveToJson(packagesByLicense, outputPath)
  
}

start('./', './output-licenses-verifier')
