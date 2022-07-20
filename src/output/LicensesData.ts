import { join } from 'path'
import { FsHelpers } from '../FsHelpers'
import { IModuleInfo } from '../input/getLicensesWithLicensesChecker'

export interface IPackagesByLicense {
  [license: string]: Array<string>
}

export interface ILicensesTexts {
  [licenseAbbreviation: string]: string
}

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

export class LicensesData {
  public static saveToJsonAllPackagesUsedGroupedByLicense (packagesByLicense: IPackagesByLicense, outputPath: string): void {
    const packagesByLicenseJson = JSON.stringify(packagesByLicense, null, 2)
    FsHelpers.writeFileSyncInDir(outputPath, 'packagesByLicense.json', packagesByLicenseJson)
  }

  public static saveAllLicencesToTxtFile (licenses: ILicensesTexts, outputPath: string): void {
    for (const license in licenses) {
      const licenseText = licenses[license]
      const licenseFileName = `${license.replace(/\//g, '_').replace('*', '_alt')}.txt`
      const licensesDir = join(outputPath, 'licenses')
      FsHelpers.writeFileSyncInDir(licensesDir, licenseFileName, licenseText)
    }
  }

  private packagesText: string = ''
  private allPackagesKeys: Array<string> = []

  public exportLicensesToTsOrJsFile (pckagesArray: Array<IModuleInfo>, outputPathAndFileName: string): void {
    const outputPath = outputPathAndFileName.substring(0, outputPathAndFileName.lastIndexOf('/'))
    const outputFileName = outputPathAndFileName.substring(outputPathAndFileName.lastIndexOf('/') + 1)
    const outputFileExtension = outputFileName.substring(outputFileName.lastIndexOf('.') + 1)
    const isTsFile = outputFileExtension.startsWith('ts')
    this.packagesText = JSON.stringify(pckagesArray, null, 2)
    this.getAllPackagesKeys(pckagesArray)
    this.allPackagesKeys.forEach(key => {
      this.replaceByRegex(new RegExp(`"${key}": `, 'g'), `${key}: `)
    })
    let appPackagesTs = '/* eslint-disable */\n\n/** Auto generated file - DO NOT EDIT */\n\n'
    if (isTsFile) {
      appPackagesTs += insterfaceAsString
    }
    appPackagesTs += 'export const APP_PACKAGES'
    if (isTsFile) {
      appPackagesTs += ': Array<IAppPackages>'
    }
    appPackagesTs += ` = ${this.packagesText}\n`
    FsHelpers.writeFileSyncInDir(outputPath, outputFileName, appPackagesTs)
  }

  private getAllPackagesKeys (pckagesArray: Array<IModuleInfo>): void {
    for (const packageData of pckagesArray) {
      Object.keys(packageData).forEach(key => {
        if (!this.allPackagesKeys.includes(key)) {
          this.allPackagesKeys.push(key)
        }
      })
    }
  }

  private replaceByRegex (regex: RegExp, replacement: string): void {
    this.packagesText = this.packagesText.replace(regex, replacement)
  }
}
