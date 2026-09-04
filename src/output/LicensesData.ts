import { join } from 'path'
import { FsHelpers } from '../utils/fs'
import { ILicensesTexts, IModuleInfo, IPackagesByLicense } from '../types'

const INTERFACE_AS_STRING = `export interface IAppPackages {
  name: string
  licenses: string
  license: string
  repository?: string
  publisher?: string
  email?: string
  url?: string
  notice?: string
  noticeFile?: string
  private?: boolean
}\n\n`

/** Object keys that can be written unquoted in a JS/TS object literal. */
const SAFE_IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/

export class LicensesData {
  /**
   * Writes every package and its license as a JSON array, i.e. the exact same
   * data as `exportLicensesToTsOrJsFile` without the JS/TS wrapper.
   *
   * This is the file an application ships to show its third party licenses, so
   * each entry has to be self contained: name, license identifier and the full
   * text of the license.
   */
  public static saveToJsonAllPackages (
    packagesArray: Array<IModuleInfo>,
    outputPathAndFileName: string
  ): void {
    const { folder, filename } = FsHelpers.stringToFolderFilenameAndExtension(outputPathAndFileName)
    const json = JSON.stringify(packagesArray, null, 2)
    FsHelpers.writeFileSyncInDir(folder, filename || 'app-packages.json', `${json}\n`)
  }

  public static saveToJsonAllPackagesUsedGroupedByLicense (
    packagesByLicense: IPackagesByLicense,
    outputPathAndFileName: string
  ): void {
    const { folder, filename } = FsHelpers.stringToFolderFilenameAndExtension(outputPathAndFileName)
    const packagesByLicenseJson = JSON.stringify(packagesByLicense, null, 2)
    FsHelpers.writeFileSyncInDir(folder, filename || 'licenses.json', `${packagesByLicenseJson}\n`)
  }

  public static saveAllLicencesToTxtFile (licenses: ILicensesTexts, outputPath: string): void {
    const licensesDir = join(outputPath, 'licenses')
    for (const license in licenses) {
      const licenseText = licenses[license]
      if (!licenseText) {
        continue
      }
      FsHelpers.writeFileSyncInDir(licensesDir, LicensesData.licenseToFileName(license), licenseText)
    }
  }

  /**
   * Turns a license identifier into a file name that is valid on every
   * supported platform. SPDX expressions contain characters that Windows
   * rejects in file names (`/ \ : * ? " < > |`), so they are all replaced.
   */
  public static licenseToFileName (license: string): string {
    const safe = license
      .replace(/\*/g, '_alt')
      .replace(/[/\\:?"<>|]/g, '_')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
    return `${safe || 'UNKNOWN'}.txt`
  }

  public exportLicensesToTsOrJsFile (packagesArray: Array<IModuleInfo>, outputPathAndFileName: string): void {
    const { folder, filename, extension } = FsHelpers.stringToFolderFilenameAndExtension(outputPathAndFileName)
    const isTsFile = extension.startsWith('ts')

    let content = '/* eslint-disable */\n\n/** Auto generated file - DO NOT EDIT */\n\n'
    if (isTsFile) {
      content += INTERFACE_AS_STRING
    }
    content += 'export const APP_PACKAGES'
    if (isTsFile) {
      content += ': Array<IAppPackages>'
    }
    content += ` = ${LicensesData.stringifyPackages(packagesArray)}\n`

    FsHelpers.writeFileSyncInDir(folder, filename || 'licenses.js', content)
  }

  /**
   * Serializes the packages as a JS object literal with unquoted keys.
   *
   * Built by walking the values rather than by running regexes over the JSON,
   * so that a key name appearing inside a license text cannot be corrupted.
   */
  private static stringifyPackages (packagesArray: Array<IModuleInfo>): string {
    const entries = packagesArray.map(packageData => {
      const fields = Object.keys(packageData)
        .filter(key => (packageData as unknown as Record<string, unknown>)[key] !== undefined)
        .map(key => {
          const value = (packageData as unknown as Record<string, unknown>)[key]
          const safeKey = SAFE_IDENTIFIER.test(key) ? key : JSON.stringify(key)
          return `    ${safeKey}: ${JSON.stringify(value)}`
        })
      return `  {\n${fields.join(',\n')}\n  }`
    })
    return `[\n${entries.join(',\n')}\n]`
  }
}
