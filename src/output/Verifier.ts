import { resolve } from 'path'
import { UNKNOWN_LICENSE } from '../input/licenseResolver'
import { IModuleInfo, IVerificationResult } from '../types'
import { readManifest } from '../utils/manifest'
import { listNamesPackage, readPackageLists } from '../utils/packageLists'
import { renderDependencyTree } from './dependencyTree'

export { UNKNOWN_LICENSE }

export class Verifier {
  private licensesInPackageDotJson: Array<string> | null = null
  private packagesInPackageDotJson: Array<string> = []
  private projectKey: string | undefined = undefined
  private whitelistsLoaded = false
  private nonWhitelistedLicensesFound: Array<string> = []
  private packagesWithoutLicenseText: Array<string> = []
  private packagesWithBorrowedLicenseText: Array<string> = []
  private packagesWithUnknownLicense: Array<string> = []
  private whitelistedPackagesFound: Array<string> = []

  constructor (
    private inputPath: string,
    private packagesArray: Array<IModuleInfo>,
    private hasSetOutLicensesDir: boolean,
    private hasSetJsonPath: boolean,
    /** `name@version` of each package to the one that required it. */
    private dependencyParents: Map<string, string> = new Map()
  ) {}

  /**
   * Reports how many packages ship a copy of their license.
   *
   * This is about the completeness of the exported data, not about compliance:
   * a package that declares `"license": "MIT"` without shipping a LICENSE file
   * is perfectly usable, we just cannot include its text in the report.
   *
   * Packages that borrowed the text of their license from another package using
   * the same license are counted in a single line: there are routinely hundreds
   * of them, and nothing has to be done about any of them.
   */
  public allPackagesHaveLicense (
    packagesWithoutLicenseText: Array<string>,
    packagesWithBorrowedLicenseText: Array<string> = []
  ): void {
    const numberOfPackages = this.packagesArray.length
    this.packagesWithoutLicenseText = packagesWithoutLicenseText
    this.packagesWithBorrowedLicenseText = packagesWithBorrowedLicenseText

    if (packagesWithBorrowedLicenseText.length > 0) {
      const count = packagesWithBorrowedLicenseText.length
      console.log(`  ⚠ ${count} package${count === 1 ? ' ships' : 's ship'} no copy of their license: the text of the same license found in another package was used.`)
    }
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
    this.loadWhitelistsFromPackageDotJson()
    this.packagesWithUnknownLicense = this.packagesArray
      .filter(p => p.licenses === UNKNOWN_LICENSE && !this.isWhitelistedPackage(p.name))
      .map(p => p.name)

    if (this.packagesWithUnknownLicense.length === 0) {
      return
    }
    console.log(`\n  ❗ ${this.packagesWithUnknownLicense.length} package${this.packagesWithUnknownLicense.length === 1 ? ' has' : 's have'} an undeterminable license.`)
    console.log(`  ❗ ${this.packagesWithUnknownLicense.join(', ')}`)
    console.log('  ❗ A package with no known license grants no rights: it must be reviewed before it can be used.')

    // Unless `UNKNOWN` is also about to be reported as a non whitelisted
    // license, which prints the very same tree a few lines further down.
    const reportedAgainBelow = this.licensesInPackageDotJson !== null && !this.isWhitelisted(UNKNOWN_LICENSE)
    if (!reportedAgainBelow) {
      this.printDependencyTree(this.packagesWithUnknownLicense)
    }
  }

  public allLicensesAreWithelistedInPackageDotJson (): void {
    this.loadWhitelistsFromPackageDotJson()
    this.collectWhitelistedPackages()

    if (this.licensesInPackageDotJson === null) {
      console.log('\n  ⚠ No \'whitelistedLicenses\' property found in package.json.')
      console.log('  ⚠ Please add the \'whitelistedLicenses\' property to your package.json file to whitelist licenses.')
      console.log('  ⚠ If you do not want to whitelist licenses, you can ignore this warning.\n')
      this.printHowToWhitelist()
      return
    }
    this.checkIfAnyLicenseIsNotWhitelisted()
  }

  public result (): IVerificationResult {
    return {
      totalPackages: this.packagesArray.length,
      packagesWithLicense: this.packagesArray.length - this.packagesWithoutLicenseText.length,
      packagesWithoutLicense: this.packagesWithoutLicenseText,
      packagesWithBorrowedLicense: this.packagesWithBorrowedLicenseText,
      packagesWithUnknownLicense: this.packagesWithUnknownLicense,
      nonWhitelistedLicenses: this.nonWhitelistedLicensesFound,
      whitelistedPackages: this.whitelistedPackagesFound,
      hasWhitelist: this.licensesInPackageDotJson !== null,
      passed: this.packagesWithUnknownLicense.length === 0 && this.nonWhitelistedLicensesFound.length === 0
    }
  }

  /**
   * Reads both whitelists, and the identity of the project, from its
   * `package.json`. Memoised so that the checks can run in any order without
   * reading the manifest again.
   */
  private loadWhitelistsFromPackageDotJson (): void {
    if (this.whitelistsLoaded) {
      return
    }
    this.whitelistsLoaded = true

    const projectDir = resolve(process.cwd(), this.inputPath)
    const manifest = readManifest(projectDir)
    const lists = readPackageLists(manifest)

    this.licensesInPackageDotJson = lists.licenses
    this.packagesInPackageDotJson = lists.whitelisted
    this.projectKey = manifest && typeof manifest.name === 'string' && manifest.name
      ? `${manifest.name}@${typeof manifest.version === 'string' ? manifest.version : '0.0.0'}`
      : undefined
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

  /**
   * A whitelisted package is accepted whatever its license, because someone has
   * already reviewed that package and said so.
   *
   * `name@version` accepts that one version; the bare `name` accepts every
   * version of it, which is what a project that keeps updating a reviewed
   * dependency needs.
   */
  private isWhitelistedPackage (packageKey: string): boolean {
    return listNamesPackage(this.packagesInPackageDotJson, packageKey)
  }

  /**
   * Kept in the result for a caller that wants to know, but deliberately not
   * printed: a whitelisted package is a decision already taken, and repeating
   * it on every run is noise between the reader and the real findings.
   */
  private collectWhitelistedPackages (): void {
    this.whitelistedPackagesFound = this.packagesArray
      .filter(p => this.isWhitelistedPackage(p.name))
      .map(p => p.name)
  }

  private checkIfAnyLicenseIsNotWhitelisted (): void {
    const offendersByLicense = new Map<string, Array<string>>()
    for (const packageData of this.packagesArray) {
      if (this.isWhitelistedPackage(packageData.name) || this.isWhitelisted(packageData.licenses)) {
        continue
      }
      const offenders = offendersByLicense.get(packageData.licenses)
      if (offenders) {
        offenders.push(packageData.name)
      } else {
        offendersByLicense.set(packageData.licenses, [packageData.name])
      }
    }
    this.nonWhitelistedLicensesFound = Array.from(offendersByLicense.keys())

    const nonWhitelistedLicensesNumber: number = this.nonWhitelistedLicensesFound.length
    if (nonWhitelistedLicensesNumber === 0) {
      console.log('\n  ✔ All licenses used in this project are whitelisted in package.json.\n')
      this.printHowToWhitelist()
      return
    }

    console.log(`\n  ❗ ${nonWhitelistedLicensesNumber} license${nonWhitelistedLicensesNumber === 1 ? ' is' : 's are'} not whitelisted in package.json.`)
    console.log(`  ❗ The non whitelisted licenses being used in this project are: "${this.nonWhitelistedLicensesFound.join('", "')}"`)

    // Which packages carry the license, and why each of them is installed at
    // all: a license nobody chose usually arrives under a package somebody did.
    for (const [license, offenders] of offendersByLicense) {
      console.log(`\n  ❗ ${license}, used by ${offenders.length} package${offenders.length === 1 ? '' : 's'}:`)
      this.printDependencyTree(offenders)
    }

    console.log('')
    this.printHowToWhitelist()
    if (!this.hasSetJsonPath) {
      console.log('  ❗ To review what packages are using these licenses, pass the argument \'--jsonGroupedByLicense=[pathToDirectoryAndFileName]\'.')
    }
    if (!this.hasSetOutLicensesDir) {
      console.log('  ❗ To export the licenses texts, pass the argument \'--outLicensesDir=[pathToDirectory]\'.')
    }
    console.log('  ❗ We strongly suggest to review the licenses used in this project with the support of an attorney.\n')
  }

  private printDependencyTree (packageKeys: Array<string>): void {
    for (const line of renderDependencyTree(packageKeys, this.dependencyParents, '       ', this.projectKey)) {
      console.log(line)
    }
  }

  /**
   * One line per way out, printed only when something actually needs a decision.
   */
  private printHowToWhitelist (): void {
    // `UNKNOWN` is never a useful example: whitelisting it deliberately does
    // not silence anything, so offering it would send the reader nowhere.
    const license = this.nonWhitelistedLicensesFound.find(id => id !== UNKNOWN_LICENSE)
    const packageToReview = this.packagesWithUnknownLicense[0] || this.firstOffendingPackage()
    if (packageToReview === undefined) {
      return
    }
    if (license !== undefined) {
      console.log(`  ❗ To accept a license everywhere, add it to 'whitelistedLicenses' in package.json, e.g. "${license}".`)
    }
    console.log(`  ❗ To accept one package whatever its license, add it to 'whitelistedPackages' in package.json, e.g. "${packageToReview}".`)
  }

  private firstOffendingPackage (): string | undefined {
    const offending = this.packagesArray
      .filter(p => !this.isWhitelistedPackage(p.name) && this.nonWhitelistedLicensesFound.includes(p.licenses))
      .map(p => p.name)
    // The project itself is a poor example to give: its own license is not
    // something to whitelist away, it is something to settle.
    return offending.find(name => name !== this.projectKey) || offending[0]
  }
}
