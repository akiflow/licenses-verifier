import { readFileSync, existsSync, writeFileSync, unlinkSync, mkdirSync } from 'fs'
import { join } from 'path'
import { FsHelpers } from './FsHelpers'
import { getLicensesWithLicensesChecker } from './input/getLicensesWithLicensesChecker'

const insterfaceAsString = `export interface IAppPackages {
  name: string
  licenses: string
  license: string
  repository?: string
  publisher?: string
  email?: string
  url?: string
  notice?: string
}\n\n`

export async function start (inputPath: string, outputPath: string) {
  console.log('[LicenseVerifier] - Building list of packages with licenses:')
  const appPackages = await getLicensesWithLicensesChecker(inputPath)
  if (appPackages === null) {
    console.log(`[LicenseVerifier] ❗No packages found in path ${inputPath}`)
    return
  }
  const licenses: { [licenseAbbreviation: string]: string } = {}
  const packagesByLicense: { [license: string]: Array<string>} = {}

  let packagesWithLicense = 0
  const pckagesArray = []
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
  let packagesText = JSON.stringify(pckagesArray, null, 2)
  // replace "licenses":  with licenses:
  packagesText = packagesText.replace(/"name": /g, 'name: ')
  packagesText = packagesText.replace(/"licenses": /g, 'licenses: ')
  packagesText = packagesText.replace(/"repository": /g, 'repository: ')
  packagesText = packagesText.replace(/"publisher": /g, 'publisher: ')
  packagesText = packagesText.replace(/"url": /g, 'url: ')
  packagesText = packagesText.replace(/"email": /g, 'email: ')
  packagesText = packagesText.replace(/"license": /g, 'license: ')
  packagesText = packagesText.replace(/"notice": /g, 'notice: ')
  const appPackagesTs = `/* eslint-disable */\n\n/** Auto generated file - DO NOT EDIT */\n\n${insterfaceAsString}export const APP_PACKAGES: Array<IAppPackages> = ${packagesText}\n`
  
  if (numberOfPackages === packagesWithLicense) {
    console.log(`  ✔ All ${numberOfPackages} packages have a license, all is good.`)
  } else {
    console.log(`  ‼ ${numberOfPackages - packagesWithLicense} packages do not have a license, please check the output.`)
  }

  FsHelpers.createDirIfNotExists(outputPath)
  
  // Creates TS data file file
  writeFileSync(join(outputPath, 'licensesData.ts'), appPackagesTs)
  
  for (const license in licenses) {
    const licenseText = licenses[license]
    const licenseFileName = `${license.replace(/\//g, '_').replace('*', '_alt')}.txt`
    const licensesDir = join(outputPath, 'licenses')
    FsHelpers.createDirIfNotExists(licensesDir)
    writeFileSync(join(licensesDir, licenseFileName), licenseText)
  }

  const packagesByLicenseJson = JSON.stringify(packagesByLicense, null, 2)
  writeFileSync(join(outputPath, 'packagesByLicense.json'), packagesByLicenseJson)
}

start('./', './output-licenses-verifier')
