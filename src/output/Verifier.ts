import { IModuleInfo } from '../input/getLicensesWithLicensesChecker'
import { join } from 'path'

export class Verifier {
  private licensesInPackageDotJson: Array<string> | null = null
  private licensedUsedInProject: Array<string> = []
  private nonWhitelistedLicensesFound: Array<string> = []

  constructor (
    private inputPath: string,
    private pckagesArray: Array<IModuleInfo>,
    private hasSetOutLicensesDir: boolean,
    private hasSetJsonPath: boolean
  ) {}

  public allPackagesHaveLicense (packagesWithLicense: number): void {
    const numberOfPackages = this.pckagesArray.length

    if (numberOfPackages === packagesWithLicense) {
      console.log(`  ✔ All ${numberOfPackages} packages have a license.`)
    } else {
      console.log(`  ‼ ${numberOfPackages - packagesWithLicense} packages do not have a license, please check the above output.`)
    }
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

  private buildArrayOfLicensesUsedInProject (): void {
    this.licensedUsedInProject = this.pckagesArray.map(p => p.licenses)
    this.licensedUsedInProject = this.licensedUsedInProject.filter((item, index) => this.licensedUsedInProject.indexOf(item) === index)
  }

  private loadWhitelistedLicensesFromPackageDotJson (): void {
    const pathToPackageDotJson = join(process.cwd(), this.inputPath, 'package.json')
    this.licensesInPackageDotJson = require(pathToPackageDotJson)?.whitelistedLicenses || null
  }

  private checkIfAnyLicenseIsNotWhitelisted (): void {
    this.nonWhitelistedLicensesFound = this.licensedUsedInProject.filter(license => !this.licensesInPackageDotJson!.includes(license))
    const nonWhitelistedLicensesNumber: number = this.nonWhitelistedLicensesFound.length
    if (nonWhitelistedLicensesNumber > 0) {
      console.log(`  ❗ ${this.nonWhitelistedLicensesFound.length} license${nonWhitelistedLicensesNumber === 1 ? ' is' : 's are'} not whitelisted in package.json.`)
      console.log(`  ❗ The non whitelisted licenses being used in this project are: "${this.nonWhitelistedLicensesFound.join('", "')}"`)
      if (!this.hasSetJsonPath) {
        console.log('\n  ❗ To review what packages are using these licenses, pass the argument \'--json=[pathToDirectoryAndFileName]\'.')
      }
      if (!this.hasSetOutLicensesDir) {
        console.log('  ❗ To export the licenses texts, pass the argument \'--outLicensesDir=[pathToDirectory]\'.')
      }
      console.log('  ❗ We strongly suggest to review the licenses used in this project with the support of an attorney.')
    } else {
      console.log('\n  ✔ All licenses used in this project are whitelisted in package.json.\n')
    }
  }
}
