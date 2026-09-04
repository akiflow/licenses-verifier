import { resolve } from 'path'
import { UNKNOWN_LICENSE } from '../input/licenseResolver'
import { IModuleInfo, IVerificationResult } from '../types'
import { readManifest } from '../utils/manifest'

export { UNKNOWN_LICENSE }

export class Verifier {
  private licensesInPackageDotJson: Array<string> | null = null
  private licensesUsedInProject: Array<string> = []
  private nonWhitelistedLicensesFound: Array<string> = []
  private packagesWithoutLicenseText: Array<string> = []
  private packagesWithUnknownLicense: Array<string> = []

  constructor (
    private inputPath: string,
    private packagesArray: Array<IModuleInfo>,
    private hasSetOutLicensesDir: boolean,
    private hasSetJsonPath: boolean
  ) {}

  /**
   * Reports how many packages ship a copy of their license.
   *
   * This is about the completeness of the exported data, not about compliance:
   * a package that declares `"license": "MIT"` without shipping a LICENSE file
   * is perfectly usable, we just cannot include its text in the report.
   */
  public allPackagesHaveLicense (packagesWithoutLicenseText: Array<string>): void {
    const numberOfPackages = this.packagesArray.length
    this.packagesWithoutLicenseText = packagesWithoutLicenseText

    if (packagesWithoutLicenseText.length === 0) {
      console.log(`  ✔ All ${numberOfPackages} packages have a license.`)
    } else {
      console.log(`  ‼ ${packagesWithoutLicenseText.length} of ${numberOfPackages} packages do not ship a copy of their license, please check the above output.`)
    }
  }

  /**
   * A package whose license could not be determined at all is a genuine
   * compliance problem: it must be reviewed before the package can be used.
   */
  public noPackageHasAnUnknownLicense (): void {
    this.packagesWithUnknownLicense = this.packagesArray
      .filter(p => p.licenses === UNKNOWN_LICENSE)
      .map(p => p.name)

    if (this.packagesWithUnknownLicense.length === 0) {
      return
    }
    console.log(`\n  ❗ ${this.packagesWithUnknownLicense.length} package${this.packagesWithUnknownLicense.length === 1 ? ' has' : 's have'} an undeterminable license.`)
    console.log(`  ❗ ${this.packagesWithUnknownLicense.join(', ')}`)
    console.log('  ❗ A package with no known license grants no rights: it must be reviewed before it can be used.')
  }

  public allLicensesAreWithelistedInPackageDotJson (): void {
    this.buildArrayOfLicensesUsedInProject()
    this.loadWhitelistedLicensesFromPackageDotJson()
    if (this.licensesInPackageDotJson === null) {
      console.log('\n  ⚠ No \'whitelistedLicenses\' property found in package.json.')
      console.log('  ⚠ Please add the \'whitelistedLicenses\' property to your package.json file to whitelist licenses.')
      console.log('  ⚠ If you do not want to whitelist licenses, you can ignore this warning.\n')
      return
    }
    this.checkIfAnyLicenseIsNotWhitelisted()
  }

  public result (): IVerificationResult {
    return {
      totalPackages: this.packagesArray.length,
      packagesWithLicense: this.packagesArray.length - this.packagesWithoutLicenseText.length,
      packagesWithoutLicense: this.packagesWithoutLicenseText,
      packagesWithUnknownLicense: this.packagesWithUnknownLicense,
      nonWhitelistedLicenses: this.nonWhitelistedLicensesFound,
      hasWhitelist: this.licensesInPackageDotJson !== null,
      passed: this.packagesWithUnknownLicense.length === 0 && this.nonWhitelistedLicensesFound.length === 0
    }
  }

  private buildArrayOfLicensesUsedInProject (): void {
    const licenses = this.packagesArray.map(p => p.licenses)
    this.licensesUsedInProject = licenses.filter((item, index) => licenses.indexOf(item) === index)
  }

  private loadWhitelistedLicensesFromPackageDotJson (): void {
    const projectDir = resolve(process.cwd(), this.inputPath)
    const manifest = readManifest(projectDir)
    const whitelist = manifest && manifest.whitelistedLicenses
    this.licensesInPackageDotJson = Array.isArray(whitelist)
      ? whitelist.filter((license): license is string => typeof license === 'string')
      : null
  }

  /**
   * A license is accepted when it is whitelisted verbatim, or when it was
   * inferred from the license text (`MIT*`) and its identifier is whitelisted:
   * whitelisting `MIT` is a decision about the MIT license, not about how this
   * tool happened to find out that a package uses it.
   */
  private isWhitelisted (license: string): boolean {
    const whitelist = this.licensesInPackageDotJson as Array<string>
    if (whitelist.includes(license)) {
      return true
    }
    return license.endsWith('*') && whitelist.includes(license.slice(0, -1))
  }

  private checkIfAnyLicenseIsNotWhitelisted (): void {
    this.nonWhitelistedLicensesFound = this.licensesUsedInProject.filter(license => !this.isWhitelisted(license))
    const nonWhitelistedLicensesNumber: number = this.nonWhitelistedLicensesFound.length
    if (nonWhitelistedLicensesNumber > 0) {
      console.log(`\n  ❗ ${nonWhitelistedLicensesNumber} license${nonWhitelistedLicensesNumber === 1 ? ' is' : 's are'} not whitelisted in package.json.`)
      console.log(`  ❗ The non whitelisted licenses being used in this project are: "${this.nonWhitelistedLicensesFound.join('", "')}"`)
      if (!this.hasSetJsonPath) {
        console.log('\n  ❗ To review what packages are using these licenses, pass the argument \'--jsonGroupedByLicense=[pathToDirectoryAndFileName]\'.')
      }
      if (!this.hasSetOutLicensesDir) {
        console.log('  ❗ To export the licenses texts, pass the argument \'--outLicensesDir=[pathToDirectory]\'.')
      }
      console.log('  ❗ We strongly suggest to review the licenses used in this project with the support of an attorney.\n')
    } else {
      console.log('\n  ✔ All licenses used in this project are whitelisted in package.json.\n')
    }
  }
}
