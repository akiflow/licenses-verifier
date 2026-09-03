import { describe, expect, test } from 'bun:test'
import { Verifier } from '../src/output/Verifier'
import type { IModuleInfo } from '../src/types'
import * as h from './helpers'

const pkg = (name: string, licenses: string): IModuleInfo => ({ name, licenses, license: 'text' })

/** Runs the three checks against a project whose package.json holds `whitelist`. */
function verify (
  packages: Array<IModuleInfo>,
  whitelist?: unknown,
  flags: { json?: boolean, licensesDir?: boolean } = {}
) {
  return h.withTempDir(dir => {
    const manifest: Record<string, unknown> = { name: 'root', version: '1.0.0' }
    if (whitelist !== undefined) {
      manifest.whitelistedLicenses = whitelist
    }
    h.writeProject(dir, manifest)
    const verifier = new Verifier(dir, packages, !!flags.licensesDir, !!flags.json)
    const captured = h.captureConsole(() => {
      verifier.allPackagesHaveLicense([])
      verifier.noPackageHasAnUnknownLicense()
      verifier.allLicensesAreWithelistedInPackageDotJson()
      return verifier.result()
    })
    return captured
  })
}

describe('allPackagesHaveLicense', () => {
  test('confirms when every package ships its license text', () => {
    const { out, result } = verify([pkg('a@1', 'MIT')], ['MIT'])
    expect(out).toContain('✔ All 1 packages have a license.')
    expect(result.packagesWithLicense).toBe(1)
    expect(result.packagesWithoutLicense).toEqual([])
  })

  test('reports how many packages ship no license text', () => {
    h.withTempDir(dir => {
      h.writeProject(dir, { name: 'root', version: '1.0.0', whitelistedLicenses: ['MIT'] })
      const packages = [pkg('a@1', 'MIT'), pkg('b@1', 'MIT'), pkg('c@1', 'MIT')]
      const verifier = new Verifier(dir, packages, false, false)
      const { out } = h.captureConsole(() => verifier.allPackagesHaveLicense(['b@1', 'c@1']))
      expect(out).toContain('‼ 2 of 3 packages do not ship a copy of their license')
      expect(verifier.result().packagesWithoutLicense).toEqual(['b@1', 'c@1'])
      expect(verifier.result().packagesWithLicense).toBe(1)
    })
  })

  test('a missing license text does not fail the verification', () => {
    h.withTempDir(dir => {
      h.writeProject(dir, { name: 'root', version: '1.0.0', whitelistedLicenses: ['MIT'] })
      const verifier = new Verifier(dir, [pkg('a@1', 'MIT')], false, false)
      h.captureConsole(() => {
        verifier.allPackagesHaveLicense(['a@1'])
        verifier.noPackageHasAnUnknownLicense()
        verifier.allLicensesAreWithelistedInPackageDotJson()
      })
      expect(verifier.result().passed).toBe(true)
    })
  })
})

describe('noPackageHasAnUnknownLicense', () => {
  test('says nothing when every license is known', () => {
    const { out } = verify([pkg('a@1', 'MIT')], ['MIT'])
    expect(out).not.toContain('undeterminable')
  })

  test('fails on a single unknown license, with singular wording', () => {
    const { out, result } = verify([pkg('a@1', 'UNKNOWN')], ['MIT', 'UNKNOWN'])
    expect(out).toContain('1 package has an undeterminable license')
    expect(out).toContain('a@1')
    expect(out).toContain('grants no rights')
    expect(result.packagesWithUnknownLicense).toEqual(['a@1'])
    expect(result.passed).toBe(false)
  })

  test('fails on several unknown licenses, with plural wording', () => {
    const { out, result } = verify([pkg('a@1', 'UNKNOWN'), pkg('b@1', 'UNKNOWN')], ['UNKNOWN'])
    expect(out).toContain('2 packages have an undeterminable license')
    expect(result.packagesWithUnknownLicense).toEqual(['a@1', 'b@1'])
  })

  test('whitelisting UNKNOWN is not a way to opt out', () => {
    expect(verify([pkg('a@1', 'UNKNOWN')], ['UNKNOWN']).result.passed).toBe(false)
  })

  test('UNLICENSED is not treated as unknown', () => {
    // A private package declaring UNLICENSED has said what it means.
    const { result } = verify([pkg('a@1', 'UNLICENSED')], ['UNLICENSED'])
    expect(result.packagesWithUnknownLicense).toEqual([])
    expect(result.passed).toBe(true)
  })
})

describe('allLicensesAreWithelistedInPackageDotJson', () => {
  test('passes when every license is whitelisted', () => {
    const { out, result } = verify([pkg('a@1', 'MIT'), pkg('b@1', 'ISC')], ['MIT', 'ISC'])
    expect(out).toContain('✔ All licenses used in this project are whitelisted')
    expect(result.nonWhitelistedLicenses).toEqual([])
    expect(result.passed).toBe(true)
    expect(result.hasWhitelist).toBe(true)
  })

  test('accepts an inferred license whose identifier is whitelisted', () => {
    // Whitelisting MIT is a decision about the license, not about how the tool
    // found out that a package uses it.
    expect(verify([pkg('a@1', 'MIT*')], ['MIT']).result.passed).toBe(true)
    expect(verify([pkg('a@1', 'MIT*')], ['MIT*']).result.passed).toBe(true)
  })

  test('does not accept an inferred license whose identifier is not whitelisted', () => {
    expect(verify([pkg('a@1', 'GPL-3.0*')], ['MIT']).result.passed).toBe(false)
  })

  test('reports a single non whitelisted license with singular wording', () => {
    const { out, result } = verify([pkg('a@1', 'GPL-3.0')], ['MIT'])
    expect(out).toContain('1 license is not whitelisted')
    expect(out).toContain('"GPL-3.0"')
    expect(result.nonWhitelistedLicenses).toEqual(['GPL-3.0'])
    expect(result.passed).toBe(false)
  })

  test('reports several non whitelisted licenses with plural wording', () => {
    const { out } = verify([pkg('a@1', 'GPL-3.0'), pkg('b@1', 'AGPL-3.0')], ['MIT'])
    expect(out).toContain('2 licenses are not whitelisted')
    expect(out).toContain('"GPL-3.0", "AGPL-3.0"')
  })

  test('lists each license once even when many packages use it', () => {
    const { result } = verify([pkg('a@1', 'GPL-3.0'), pkg('b@1', 'GPL-3.0')], ['MIT'])
    expect(result.nonWhitelistedLicenses).toEqual(['GPL-3.0'])
  })

  test('suggests the options that would explain the problem', () => {
    const { out } = verify([pkg('a@1', 'GPL-3.0')], ['MIT'])
    expect(out).toContain('--json=')
    expect(out).toContain('--outLicensesDir=')
  })

  test('does not suggest an option that was already given', () => {
    const { out } = verify([pkg('a@1', 'GPL-3.0')], ['MIT'], { json: true, licensesDir: true })
    expect(out).not.toContain('--json=')
    expect(out).not.toContain('--outLicensesDir=')
    expect(out).toContain('support of an attorney')
  })

  test('warns and passes when the project declares no whitelist', () => {
    const { out, result } = verify([pkg('a@1', 'GPL-3.0')])
    expect(out).toContain("⚠ No 'whitelistedLicenses' property found in package.json.")
    expect(result.hasWhitelist).toBe(false)
    expect(result.nonWhitelistedLicenses).toEqual([])
    expect(result.passed).toBe(true)
  })

  test('treats a whitelist that is not an array as absent', () => {
    for (const whitelist of ['MIT', 42, {}, null]) {
      expect(verify([pkg('a@1', 'GPL-3.0')], whitelist).result.hasWhitelist).toBe(false)
    }
  })

  test('ignores whitelist entries that are not strings', () => {
    const { result } = verify([pkg('a@1', 'MIT')], ['MIT', 42, null, {}])
    expect(result.hasWhitelist).toBe(true)
    expect(result.passed).toBe(true)
  })

  test('an empty whitelist rejects everything', () => {
    const { result } = verify([pkg('a@1', 'MIT')], [])
    expect(result.hasWhitelist).toBe(true)
    expect(result.nonWhitelistedLicenses).toEqual(['MIT'])
  })

  test('treats a project with no package.json as having no whitelist', () => {
    h.withTempDir(dir => {
      const verifier = new Verifier(dir, [pkg('a@1', 'GPL-3.0')], false, false)
      const { out } = h.captureConsole(() => verifier.allLicensesAreWithelistedInPackageDotJson())
      expect(out).toContain("No 'whitelistedLicenses' property found")
      expect(verifier.result().hasWhitelist).toBe(false)
    })
  })
})

describe('result', () => {
  test('counts the packages it was given', () => {
    const { result } = verify([pkg('a@1', 'MIT'), pkg('b@1', 'ISC')], ['MIT', 'ISC'])
    expect(result.totalPackages).toBe(2)
  })

  test('fails when either check fails, and passes only when both do', () => {
    expect(verify([pkg('a@1', 'MIT')], ['MIT']).result.passed).toBe(true)
    expect(verify([pkg('a@1', 'GPL-3.0')], ['MIT']).result.passed).toBe(false)
    expect(verify([pkg('a@1', 'UNKNOWN')], ['UNKNOWN']).result.passed).toBe(false)
    expect(verify([pkg('a@1', 'UNKNOWN')], ['MIT']).result.passed).toBe(false)
  })

  test('is readable before any check has run', () => {
    h.withTempDir(dir => {
      const result = new Verifier(dir, [pkg('a@1', 'MIT')], false, false).result()
      expect(result.totalPackages).toBe(1)
      expect(result.hasWhitelist).toBe(false)
      expect(result.passed).toBe(true)
    })
  })
})
