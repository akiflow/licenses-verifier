import { FsHelpers } from '../FsHelpers'
import { IModuleInfo } from '../input/getLicensesWithLicensesChecker'

export interface IPackagesByLicense {
  [license: string]: Array<string>
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
  public static saveToJson (packagesByLicense: IPackagesByLicense, outputPath: string): void {
    const packagesByLicenseJson = JSON.stringify(packagesByLicense, null, 2)
    FsHelpers.writeFileSyncInDir(outputPath, 'packagesByLicense.json', packagesByLicenseJson)
  }

  private packagesText: string = ''
  private allPackagesKeys: Array<string> = []

  public exportLicensesData (pckagesArray: Array<IModuleInfo>, outputPath: string): void {
    this.packagesText = JSON.stringify(pckagesArray, null, 2)
    this.getAllPackagesKeys(pckagesArray)
    this.allPackagesKeys.forEach(key => {
      this.replaceByRegex(new RegExp(`"${key}": `, 'g'), `${key}: `)
    })
    const appPackagesTs = `/* eslint-disable */\n\n/** Auto generated file - DO NOT EDIT */\n\n${insterfaceAsString}export const APP_PACKAGES: Array<IAppPackages> = ${this.packagesText}\n`
    FsHelpers.writeFileSyncInDir(outputPath, 'licensesData.ts', appPackagesTs)
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
