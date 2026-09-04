import { describe, expect, test } from 'bun:test'
import { Verifier } from '../src/output/Verifier'
import type { IModuleInfo } from '../src/types'
import * as h from './helpers'

const pkg = (name: string, licenses: string): IModuleInfo => ({ name, licenses, license: 'text' })

interface IVerifyFlags {
  json?: boolean
  licensesDir?: boolean
  /** Written to the `whitelistedPackages` of the project package.json. */
  packages?: unknown
  /** `name@version` of each package to the one that required it. */
  parents?: Map<string, string>
}

/** Runs the three checks against a project whose package.json holds `whitelist`. */
function verify (
  packages: Array<IModuleInfo>,
  whitelist?: unknown,
  flags: IVerifyFlags = {}
) {
  return h.withTempDir(dir => {
    const manifest: Record<string, unknown> = { name: 'root', version: '1.0.0' }
    if (whitelist !== undefined) {
      manifest.whitelistedLicenses = whitelist
    }
    if (flags.packages !== undefined) {
      manifest.whitelistedPackages = flags.packages
    }
    h.writeProject(dir, manifest)
    const verifier = new Verifier(dir, packages, !!flags.licensesDir, !!flags.json, flags.parents)
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
      // The count, then each package: every one of them needs a look.
      expect(out).toContain('‼ No license found for 2 of 3 packages:')
      expect(out).toContain('       b@1')
      expect(out).toContain('       c@1')
      expect(out).not.toContain('a@1')
      expect(verifier.result().packagesWithoutLicense).toEqual(['b@1', 'c@1'])
      expect(verifier.result().packagesWithLicense).toBe(1)
    })
  })

  test('reports the packages that borrowed their license text in one line', () => {
    h.withTempDir(dir => {
      h.writeProject(dir, { name: 'root', version: '1.0.0', whitelistedLicenses: ['MIT'] })
      const packages = [pkg('a@1', 'MIT'), pkg('b@1', 'MIT'), pkg('c@1', 'MIT')]
      const verifier = new Verifier(dir, packages, false, false)
      const { out } = h.captureConsole(() => verifier.allPackagesHaveLicense([], ['b@1', 'c@1']))

      // One line, however many packages: there is nothing to do about any of
      // them, so naming each one would only bury the real problems.
      expect(out).toContain('⚠ 2 packages ship no copy of their license')
      expect(out).not.toContain('b@1')
      expect(out).toContain('✔ All 3 packages have a license.')
      expect(verifier.result().packagesWithBorrowedLicense).toEqual(['b@1', 'c@1'])
    })
  })

  test('uses the singular for a single borrowed license text', () => {
    h.withTempDir(dir => {
      h.writeProject(dir, { name: 'root', version: '1.0.0', whitelistedLicenses: ['MIT'] })
      const verifier = new Verifier(dir, [pkg('a@1', 'MIT')], false, false)
      const { out } = h.captureConsole(() => verifier.allPackagesHaveLicense([], ['a@1']))
      expect(out).toContain('⚠ 1 package ships no copy of their license')
    })
  })

  test('says nothing about borrowing when nothing was borrowed', () => {
    const { out, result } = verify([pkg('a@1', 'MIT')], ['MIT'])
    expect(out).not.toContain('ship no copy')
    expect(result.packagesWithBorrowedLicense).toEqual([])
  })

  test('shows the dependency tree of the packages with no license', () => {
    h.withTempDir(dir => {
      h.writeProject(dir, { name: 'root', version: '1.0.0', whitelistedLicenses: ['MIT'] })
      const parents = new Map([['mystery@1', 'toolkit@1'], ['toolkit@1', 'root@1.0.0']])
      const verifier = new Verifier(dir, [pkg('mystery@1', 'MIT')], false, false, parents)
      const { out } = h.captureConsole(() => verifier.allPackagesHaveLicense(['mystery@1']))

      // The first question about a package with no license is why it is here.
      expect(out).toContain('‼ No license found for 1 of 1 packages:')
      expect(out).toContain('       root@1.0.0')
      expect(out).toContain('       └─ toolkit@1')
      expect(out).toContain('          └─ mystery@1 ❗')
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
    expect(out).toContain('--jsonGroupedByLicense=')
    expect(out).toContain('--outLicensesDir=')
  })

  test('does not suggest an option that was already given', () => {
    const { out } = verify([pkg('a@1', 'GPL-3.0')], ['MIT'], { json: true, licensesDir: true })
    expect(out).not.toContain('--jsonGroupedByLicense=')
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

describe('the dependency tree of a non whitelisted license', () => {
  const parents = new Map([['gpl-dep@1', 'builder@1'], ['builder@1', 'root@1.0.0']])

  test('shows why each offending package is installed', () => {
    const { out } = verify([pkg('gpl-dep@1', 'GPL-3.0')], ['MIT'], { parents })
    expect(out).toContain('❗ GPL-3.0, used by 1 package:')
    expect(out).toContain('       root@1.0.0')
    expect(out).toContain('       └─ builder@1')
    expect(out).toContain('          └─ gpl-dep@1 ❗')
  })

  test('prints one tree per non whitelisted license', () => {
    const { out } = verify([pkg('gpl-dep@1', 'GPL-3.0'), pkg('other@1', 'AGPL-3.0')], ['MIT'], { parents })
    expect(out).toContain('❗ GPL-3.0, used by 1 package:')
    expect(out).toContain('❗ AGPL-3.0, used by 1 package:')
  })

  test('counts the packages carrying the license, not the tree nodes', () => {
    const { out } = verify([pkg('gpl-dep@1', 'GPL-3.0'), pkg('builder@1', 'GPL-3.0')], ['MIT'], { parents })
    expect(out).toContain('❗ GPL-3.0, used by 2 packages:')
  })

  test('says so when nothing requires the package', () => {
    const { out } = verify([pkg('stray@1', 'GPL-3.0')], ['MIT'])
    expect(out).toContain('stray@1 (not required by package.json)')
  })

  test('shows the tree of an undeterminable license only once', () => {
    // `UNKNOWN` is reported twice, as an undeterminable license and as a non
    // whitelisted one. Printing the same tree twice would only add noise.
    const { out } = verify([pkg('gpl-dep@1', 'UNKNOWN')], ['MIT'], { parents })
    expect(out.split('└─ gpl-dep@1 ❗').length - 1).toBe(1)
  })

  test('shows the tree of an undeterminable license that is whitelisted', () => {
    // Whitelisting UNKNOWN keeps it out of the non whitelisted section, so this
    // is the only place its tree can be printed.
    const { out } = verify([pkg('gpl-dep@1', 'UNKNOWN')], ['UNKNOWN'], { parents })
    expect(out).toContain('└─ gpl-dep@1 ❗')
  })
})

describe('whitelistedPackages', () => {
  test('accepts a package whose license is not whitelisted', () => {
    const { out, result } = verify([pkg('gpl-dep@1.0.0', 'GPL-3.0')], ['MIT'], { packages: ['gpl-dep@1.0.0'] })
    expect(result.passed).toBe(true)
    expect(result.nonWhitelistedLicenses).toEqual([])
    expect(result.whitelistedPackages).toEqual(['gpl-dep@1.0.0'])
    // Reported in the result, but never printed: the decision is already taken.
    expect(out).not.toContain('gpl-dep')
    expect(out).not.toContain('whitelisted in package.json and')
  })

  test('accepts a package whose license could not be determined at all', () => {
    // The escape hatch that whitelisting UNKNOWN deliberately is not: it names
    // the one package that was reviewed, not every future surprise.
    const { result } = verify([pkg('mystery@1.0.0', 'UNKNOWN')], ['MIT'], { packages: ['mystery@1.0.0'] })
    expect(result.passed).toBe(true)
    expect(result.packagesWithUnknownLicense).toEqual([])
  })

  test('a bare name accepts every version of the package', () => {
    const { result } = verify([pkg('gpl-dep@2.5.0', 'GPL-3.0')], ['MIT'], { packages: ['gpl-dep'] })
    expect(result.passed).toBe(true)
    expect(result.whitelistedPackages).toEqual(['gpl-dep@2.5.0'])
  })

  test('a name and version accepts only that version', () => {
    const { result } = verify([pkg('gpl-dep@2.5.0', 'GPL-3.0')], ['MIT'], { packages: ['gpl-dep@1.0.0'] })
    expect(result.passed).toBe(false)
    expect(result.whitelistedPackages).toEqual([])
  })

  test('handles a scoped package', () => {
    expect(verify([pkg('@scope/dep@1.0.0', 'GPL-3.0')], ['MIT'], { packages: ['@scope/dep@1.0.0'] }).result.passed).toBe(true)
    expect(verify([pkg('@scope/dep@1.0.0', 'GPL-3.0')], ['MIT'], { packages: ['@scope/dep'] }).result.passed).toBe(true)
    expect(verify([pkg('@scope/dep@1.0.0', 'GPL-3.0')], ['MIT'], { packages: ['@scope/other'] }).result.passed).toBe(false)
  })

  test('still reports a license used by another package that is not whitelisted', () => {
    const { result } = verify(
      [pkg('gpl-dep@1.0.0', 'GPL-3.0'), pkg('gpl-other@1.0.0', 'GPL-3.0')],
      ['MIT'],
      { packages: ['gpl-dep@1.0.0'] }
    )
    expect(result.nonWhitelistedLicenses).toEqual(['GPL-3.0'])
    expect(result.passed).toBe(false)
  })

  test('ignores entries that are not strings, and an absent whitelist', () => {
    expect(verify([pkg('a@1', 'GPL-3.0')], ['MIT'], { packages: [42, null, {}] }).result.passed).toBe(false)
    expect(verify([pkg('a@1', 'GPL-3.0')], ['MIT'], { packages: 'a@1' }).result.passed).toBe(false)
    expect(verify([pkg('a@1', 'GPL-3.0')], ['MIT']).result.whitelistedPackages).toEqual([])
  })
})

describe('the instructions to whitelist', () => {
  test('name both ways out when a license is not whitelisted', () => {
    const { out } = verify([pkg('gpl-dep@1.0.0', 'GPL-3.0')], ['MIT'])
    expect(out).toContain('\'whitelistedLicenses\' in package.json, e.g. "GPL-3.0"')
    expect(out).toContain('\'whitelistedPackages\' in package.json, e.g. "gpl-dep@1.0.0"')
  })

  test('name the package only, when whitelisting the license would not help', () => {
    // Whitelisting UNKNOWN does not silence anything, so suggesting it would
    // send the reader down a dead end.
    const { out } = verify([pkg('mystery@1.0.0', 'UNKNOWN')], ['UNKNOWN'])
    expect(out).not.toContain('\'whitelistedLicenses\' in package.json, e.g.')
    expect(out).toContain('\'whitelistedPackages\' in package.json, e.g. "mystery@1.0.0"')
  })

  test('do not name a package that is already whitelisted', () => {
    const { out } = verify(
      [pkg('accepted@1.0.0', 'GPL-3.0'), pkg('still-here@1.0.0', 'GPL-3.0')],
      ['MIT'],
      { packages: ['accepted@1.0.0'] }
    )
    expect(out).toContain('e.g. "still-here@1.0.0"')
    expect(out).not.toContain('e.g. "accepted@1.0.0"')
  })

  test('do not name the project itself when a dependency can be named instead', () => {
    // Whitelisting the project in its own package.json settles nothing.
    const { out } = verify([pkg('root@1.0.0', 'UNLICENSED'), pkg('dep@1.0.0', 'UNLICENSED')], ['MIT'])
    expect(out).toContain('e.g. "dep@1.0.0"')
  })

  test('never offer UNKNOWN as the license to whitelist', () => {
    // Whitelisting UNKNOWN does not silence it, so it is not a way out.
    const { out } = verify([pkg('mystery@1.0.0', 'UNKNOWN'), pkg('gpl-dep@1.0.0', 'GPL-3.0')], ['MIT'])
    expect(out).toContain('\'whitelistedLicenses\' in package.json, e.g. "GPL-3.0"')
    expect(out).not.toContain('e.g. "UNKNOWN"')
  })

  test('name no license at all when UNKNOWN is the only one', () => {
    const { out } = verify([pkg('mystery@1.0.0', 'UNKNOWN')], ['MIT'])
    expect(out).not.toContain('\'whitelistedLicenses\' in package.json, e.g.')
    expect(out).toContain('\'whitelistedPackages\' in package.json, e.g. "mystery@1.0.0"')
  })

  test('are printed when the project declares no whitelist at all', () => {
    const { out } = verify([pkg('mystery@1.0.0', 'UNKNOWN')])
    expect(out).toContain('\'whitelistedPackages\' in package.json, e.g. "mystery@1.0.0"')
  })

  test('are not printed when there is nothing to decide', () => {
    const { out } = verify([pkg('a@1', 'MIT')], ['MIT'])
    expect(out).not.toContain('whitelistedPackages')
  })

  test('are one line each', () => {
    const { out } = verify([pkg('gpl-dep@1.0.0', 'GPL-3.0')], ['MIT'])
    const instructions = out.split('\n').filter(line => line.includes('add it to'))
    expect(instructions).toHaveLength(2)
    for (const line of instructions) {
      expect(line.length).toBeLessThan(120)
    }
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
