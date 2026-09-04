# Licenses Verifier

**Know which licenses you are shipping — before your lawyers, your customers or an acquirer ask.**

[![npm](https://img.shields.io/npm/v/@akiflow/licenses-verifier)](https://www.npmjs.com/package/@akiflow/licenses-verifier)
[![node](https://img.shields.io/node/v/@akiflow/licenses-verifier)](https://nodejs.org)
[![license](https://img.shields.io/npm/l/@akiflow/licenses-verifier)](./LICENSE)

One command reads every dependency in your project, works out what each one is licensed under, checks it against the list your legal team approved, and fails the build when something is not on it.

**Zero dependencies.** Installing this tool adds exactly one package to your project, and nothing else. Runs on macOS, Windows and Linux, on Node 14 and later.

```console
$ npx licenses-verifier --production

[LicenseVerifier] - Analyzing project in directory /Users/you/projects/acme-dashboard

  ❗ No license file for package: legacy-shim@0.4.0. No license found for this package. ‼
  ⚠ 3 packages ship no copy of their license: the text of the same license found in another package was used.
  ‼ 1 of 9 packages do not ship a copy of their license, please check the above output.

  ❗ 1 package has an undeterminable license.
  ❗ legacy-shim@0.4.0
  ❗ A package with no known license grants no rights: it must be reviewed before it can be used.

  ❗ 2 licenses are not whitelisted in package.json.
  ❗ The non whitelisted licenses being used in this project are: "UNKNOWN", "GPL-3.0"

  ❗ UNKNOWN, used by 1 package:
       acme-dashboard@1.4.0
       └─ ui-charts@4.1.0
          └─ legacy-shim@0.4.0 ❗

  ❗ GPL-3.0, used by 1 package:
       acme-dashboard@1.4.0
       └─ report-builder@2.3.0
          └─ pdf-render@3.0.1 ❗

  ❗ To accept a license everywhere, add it to 'whitelistedLicenses' in package.json, e.g. "GPL-3.0".
  ❗ To accept one package whatever its license, add it to 'whitelistedPackages' in package.json, e.g. "legacy-shim@0.4.0".
  ❗ To review what packages are using these licenses, pass the argument '--jsonGroupedByLicense=[pathToDirectoryAndFileName]'.
  ❗ To export the licenses texts, pass the argument '--outLicensesDir=[pathToDirectory]'.
  ❗ We strongly suggest to review the licenses used in this project with the support of an attorney.

$ echo $?
1
```

Nobody added `pdf-render` on purpose. It arrived under `report-builder`, which somebody did add — and that is where the problem gets fixed. The tree says so in three lines, and the build stops before a GPL-3.0 dependency ships inside a proprietary app.

## Who is this for?

### Developers

- **One command, no configuration** beyond a list of approved licenses in your `package.json`.
- **A CI gate that means something.** Exit code `1` when a license is not approved or cannot be determined, `2` on a typo in the arguments. No plugin, no service, no account.
- **Actionable failures.** Not "you have a GPL dependency" but *which* package, and *which of your own dependencies* dragged it in, so you know what to replace or what to ask upstream about.
- **Nothing to audit but the tool itself.** Zero runtime dependencies: the thing checking your supply chain is not itself a supply chain.

### Legal and due diligence

- **A complete inventory**: every package, its license identifier and the full text of that license, as JSON your counsel can work through.
- **One file per license** (`--outLicensesDir`), ready to hand to an attorney without them cloning anything.
- **No opinions baked in.** There is no bundled whitelist. What is acceptable depends on your project, and that decision belongs to your lawyers — it lives in your `package.json`, reviewed like any other change and versioned with the code.
- **A record over time.** Because the approved list is in the repository, `git log` shows who approved which license, and when. That is a question due diligence actually asks.

### Product and compliance

- **The "Third-party licenses" screen, generated.** `--json` writes the file your app can ship and render as is — or a `.ts`/`.js` module to import instead (`--tsOrJsFile`).
- **Stable output.** Files are sorted by `name@version`, so a regenerated file diffs down to what actually changed.

### What it will not do for you

This tool tells you what you are using. It does not tell you whether you are allowed to use it: that depends on your product, how you distribute it and where. Read the [disclaimer](#disclaimer), and talk to a lawyer.

## Quick start

Install it as a dev dependency, so that CI uses a pinned version:

    yarn add --dev @akiflow/licenses-verifier

or

    npm install --save-dev @akiflow/licenses-verifier

List the licenses your lawyers approved, in your `package.json`:

    "whitelistedLicenses": [
        "MIT",
        "Apache-2.0",
        "ISC",
        "BSD-3-Clause"
    ]

Add it to your scripts, and to CI:

    "scripts": {
        "check-licenses": "licenses-verifier --production"
    }

That is the whole setup. Everything below is reference material.

## How it works

Licenses Verifier lists every dependency of your project — production and development, recursively — determines the license of each one, and checks it against the `whitelistedLicenses` array of your `package.json`.

A dependency whose license is not on that list is reported as a problem. So is a dependency whose license cannot be determined at all. If no whitelist is provided, a warning is shown instead.

### Whitelisting a package

Sometimes the decision is about one package rather than about a license: a proprietary dependency you have a contract for, or a package whose license cannot be determined but that you have reviewed. Add it to the `whitelistedPackages` array in `package.json` and it is accepted whatever its license.

    "whitelistedPackages": [
        "@vendor/sdk@2.4.0",
        "some-package"
    ]

`name@version` accepts that one version, so a version bump comes back for review. The bare `name` accepts every version of it.

A whitelisted package produces **no output at all** — not an error, not a warning, not even a note that it ships no license text. The decision has been taken, and repeating it on every run would only stand between you and the findings that still need one. It is still included in the generated files: it is a dependency of your application whatever anyone decided about its license, and the "Third-party licenses" screen has to list it.

This is also the only way to accept a package whose license is `UNKNOWN`: whitelisting the `UNKNOWN` identifier deliberately does not work, because it would also accept every future package the tool cannot make sense of.

### Excluding a package

A whitelist accepts a package. `excludedPackages` goes further: the package is left out of the report **and** of every generated file, as if it were not installed.

    "excludedPackages": [
        "@internal/build-tooling",
        "some-package@1.2.3"
    ]

The same matching rules apply: `name@version` excludes that one version, a bare `name` excludes every version of it.

Everything the excluded package brought in goes with it — but only what it alone brought in. A dependency that something else also requires stays in the report, under that other package, where it belongs.

Use it for what is genuinely not part of what you ship: your own internal packages, a tool that never reaches production. Do not use it to make a license problem go away — `whitelistedPackages` is the honest way to say "reviewed and accepted", and it leaves a record.

### Why is this package here?

Every non whitelisted license is reported together with the packages using it, as the tree of dependencies that brought each of them in. The packages carrying the license are marked with `❗`; the others are on the way to them.

    ❗ GPL-3.0, used by 1 package:
         app@1.0.0
         └─ some-toolkit@2.1.0
            └─ copyleft-dep@1.0.0 ❗

Nobody chooses a copyleft dependency on purpose: it arrives under something that was chosen. The tree says under what, which is usually where the problem has to be fixed.

### How the license of a package is determined

In order, Licenses Verifier uses:

1. the `license` field of the package `package.json` (the deprecated `license: { type }` object and `licenses: [...]` array are supported too);
2. failing that, the text of the license file shipped by the package (`LICENSE`, `LICENCE`, `COPYING`, `LICENSE-MIT`, …, in any capitalisation);
3. failing that, the text of the package `README`, but only when the README actually contains the text of a license.

A license identified from a text rather than declared by the package is reported with a `*` suffix, for example `MIT*`. Whitelisting `MIT` also accepts `MIT*`: the whitelist is a decision about the MIT license, not about how the tool found out that a package uses it.

When no license can be determined at all, the package is reported as `UNKNOWN` and the verification fails. A package with no known license grants no rights, so whitelisting `UNKNOWN` does not silence this.

A package that declares a license but ships no copy of its text is reported with a warning, and the text of the same license found in another package is used in the exported data. This is a warning and not a failure: the license is known, it is only its text that is missing.

Text is only shared between packages when the identifier names an actual license, i.e. one whose terms are the same for everyone using it. `UNKNOWN`, `UNLICENSED` and `SEE LICENSE IN <file>` are placeholders rather than licenses: two packages carrying one of them share an identifier and no terms at all. Such a package therefore keeps an empty license text and is reported as shipping none, and no file is written for it by `--outLicensesDir`. Lending it the text of another package would publish a license grant that was never made — typically an open source grant over someone's proprietary code.

### Which licenses can I whitelist?

Short answer: ask your lawyers.

Longer answer: you need to verify that the license allows you to use the dependency in your specific project. Many very common licenses, although referred as “open source”, do have specific requirements for use in other projects. Verifying how to comply with those requirements is a matter that should be addressed by a qualified attorney. For this reason, Licenses Verifier does not include any pre-populated license whitelist. Each project may or may not whitelist a license, depending on the project’s characteristics.

For this reason we recommend that you consult with your lawyer before whitelisting a license. You should do so for each project you work on. We strongly suggest not to reuse the same license whitelist in multiple projects without prior consultation with your lawyer.

## Usage

    yarn licenses-verifier

or, having added `"licenses": "licenses-verifier"` to the `scripts` of your `package.json`:

    yarn licenses

It can also be installed globally:

    yarn global add @akiflow/licenses-verifier

### Options

All parameters are optional.

    --projectPath=<path>
        The directory of the project to analyze.
        If not specified, the current directory will be used.

    --tsOrJsFile=<pathAndFilename>
        the path and name of the file in which all packages and licenses will be made available
        to be imported in your code. Useful to include links and other information about the
        dependencies used in your project.
        A `.ts` file also gets the `IAppPackages` interface; a `.js` file does not.

    --outLicensesDir=<directory>
        the directory in which the licenses will be saved. A separate file will be created for
        each license, under `<directory>/licenses`. Useful if you need to provide the licenses to
        a third party, for example, an attorney to help you review the licenses.

    --json=<pathAndFilename>
        the path and name of the file in which every package and its license will be saved, as a
        JSON array. It holds exactly the same data as `--tsOrJsFile`, without the JS/TS wrapper:
        this is the file an application fetches at runtime to show its third party licenses.
        Also accepted as `--outputJsonFile` and `--jsonFile`.

    --jsonGroupedByLicense=<pathAndFilename>
        the path and name of the file in which the names of all the packages used in the project,
        grouped by license, will be saved. Useful to identify which packages are using which
        licenses.

    --production
        Only check the dependencies that ship in production, i.e. everything reachable from
        `dependencies` and `optionalDependencies`.

    --development
        Only check the dependencies that do not ship in production, i.e. everything reachable
        from `devDependencies` and not from the production dependencies.

    --help, --version

With neither `--production` nor `--development`, every package installed under the project is
checked, plus everything its `package.json` points to. Reporting one package too many is
recoverable; missing one is not.

Paths may use forward slashes on every platform, Windows included.

### Exit codes

| Code | Meaning |
| ---- | ------- |
| `0`  | The verification passed. |
| `1`  | A license is not whitelisted, or a package has no determinable license. |
| `2`  | Bad usage, or no project found at the given path. |

This makes the tool usable as a CI gate:

    npx licenses-verifier --production

### Use as a library

The package also exposes its API, with TypeScript types:

```ts
import { getLicenses, start } from '@akiflow/licenses-verifier'

// Just the data: every installed package, keyed by `name@version`.
const packages = getLicenses({ projectPath: './' })

// The whole verification, including the report printed to stdout.
const result = start({ projectPath: './' })
if (result && !result.passed) {
  console.log(result.nonWhitelistedLicenses, result.packagesWithUnknownLicense)
}
```

## Upgrading from version 2

Version 3 is a rewrite with no runtime dependencies. The CLI options and the shape of the
generated files are unchanged, with these differences:

- **The command now fails when the verification fails.** Version 2 always exited 0, which made
  it useless as a CI gate. If a pipeline relied on the old behaviour, it will start reporting the
  licensing problems that were already there.
- **An unknown option is now an error** (exit code 2) instead of being silently ignored, so a
  typo in a CI pipeline cannot quietly skip the check.
- **A package that ships no license text no longer fails the check.** Only a package whose
  license cannot be determined at all does.
- **The text of a license is no longer shared across `UNKNOWN`, `UNLICENSED` and
  `SEE LICENSE IN <file>`.** Version 2 copied the text of one such package onto every other
  package carrying the same placeholder, which published a license grant that was never made.
- **`--json` now writes an array of packages**, the same data as `--tsOrJsFile` without the
  JS/TS wrapper, so that an application can ship it and render it as is. The old grouping by
  license moved to `--jsonGroupedByLicense`.
- **The generated files are sorted by `name@version`**, so regenerating them shows only real
  changes in a diff.
- A package whose `package.json` is marked `"private": true` now carries `private: true` in the
  generated files, so an application can leave its own internal packages out of the list it shows.
- **Packages that borrow the text of their license** from another package using the same license
  are now reported in a single line instead of one warning each.
- **A non whitelisted license is now reported with the dependency tree** of the packages using it.
- **Packages can be whitelisted** through `whitelistedPackages` in `package.json`. A whitelisted
  package produces no output at all, while still appearing in the generated files.
- **Packages can be excluded** through `excludedPackages` in `package.json`, together with
  everything only they required: those do not appear in the generated files either.
- `--outputJsonFile` and `--jsonFile` now work as documented; version 2 only accepted `--json`.
- The library entry point no longer runs the CLI as a side effect of being imported.
- Requires Node 14 or later.

## Development

    yarn install        # installs only typescript and @types/node
    yarn build          # compiles src/ to dist/
    yarn test           # builds, then runs the test suite
    yarn test:coverage  # the same, with the coverage floor enforced
    yarn test:watch     # re-runs the suite as you edit
    yarn self-check     # runs the tool on this repository

The scripts call `node` directly rather than going through a package manager, so they behave the
same under yarn, npm and pnpm.

### Tests

The suite runs on [bun](https://bun.sh), which needs no test framework, no transpile step and no
dependencies of its own, and runs the whole suite in well under a second:

    bun test
    bun test --coverage
    bun test test/spdx.test.ts        # one file
    bun test --test-name-pattern MIT  # one subject

The unit tests import the TypeScript in `src/` directly, so coverage is reported against the real
sources. The end-to-end tests in `test/e2e.test.ts` are the exception: they run the compiled
`dist/` through the real `bin` entry point **under Node**, because that is the artifact published
to npm. They skip themselves when `dist/` has not been built.

`bunfig.toml` sets a per-file coverage floor that `bun test --coverage` enforces, so coverage
cannot quietly rot.

There are two TypeScript configs. `tsconfig.json` covers `src/` and `test/` together and emits
nothing: it is what the editor and `yarn typecheck` use, so the tests are type-checked like any
other code. `tsconfig.build.json` compiles `src/` to `dist/` and excludes the tests, so they can
never reach the published package.

To publish, run `yarn publishToNpm` from the repository root. `prepublishOnly` builds the package,
runs the tests, checks that the tarball contains runnable JavaScript and no runtime dependencies,
then installs and runs the packed tarball under both npm and yarn. Every one of those steps has to
pass.

## Disclaimer

This tool is not intended, and should not be used, as a way to avoid proper legal due diligence. You remain the sole responsible for the use of the packages listed in your dependencies. This software is provided 'as-is', without any express or implied warranty. In no event will the authors be held liable for any damages arising from the use of this software.
