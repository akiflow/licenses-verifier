/**
 * Information collected for a single installed package.
 *
 * This is the shape that ends up in the generated `.ts`/`.js` file, so it is
 * part of the public API of this package: keep it backwards compatible.
 */
export interface IModuleInfo {
  /** `name@version`, e.g. `lodash@4.17.21` */
  name: string
  /** SPDX identifier, suffixed with `*` when inferred from the license text */
  licenses: string
  /** Full text of the license */
  license: string
  repository?: string
  publisher?: string
  email?: string
  url?: string
  /** Content of the NOTICE file, when the package ships one */
  notice?: string
  /** True when the package manifest is marked `"private": true` */
  private?: boolean
  /** Absolute path of the license file. Stripped before being exported. */
  licenseFile?: string
  /** Absolute path of the package. Stripped before being exported. */
  path?: string
}

export interface IModuleInfos {
  [packageNameAndVersion: string]: IModuleInfo
}

export interface IPackagesByLicense {
  [license: string]: Array<string>
}

export interface ILicensesTexts {
  [licenseIdentifier: string]: string
}

export interface ILicensesVerifierCliOptions {
  projectPath: string
  outputTsOrJsFile?: string
  outLicensesDir?: string
  outputJsonFile?: string
  outputGroupedJsonFile?: string
  production?: boolean
  development?: boolean
}

export interface IVerificationResult {
  totalPackages: number
  packagesWithLicense: number
  /** Packages whose license is known but whose license text is not on disk */
  packagesWithoutLicense: Array<string>
  /** Packages whose license could not be determined at all */
  packagesWithUnknownLicense: Array<string>
  nonWhitelistedLicenses: Array<string>
  hasWhitelist: boolean
  /** True when every license is known and none is outside the whitelist */
  passed: boolean
}
