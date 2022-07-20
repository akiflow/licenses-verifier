import { join } from 'path'
import { FsHelpers } from '../FsHelpers'

export interface ILicensesTexts {
  [licenseAbbreviation: string]: string
}

export class LicensesFiles {
  public static saveAllLicencesToTxtFile (licenses: ILicensesTexts, outputPath: string): void {
    for (const license in licenses) {
      const licenseText = licenses[license]
      const licenseFileName = `${license.replace(/\//g, '_').replace('*', '_alt')}.txt`
      const licensesDir = join(outputPath, 'licenses')
      FsHelpers.writeFileSyncInDir(licensesDir, licenseFileName, licenseText)
    }
  }
}
