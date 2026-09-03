# Licenses Verifier

Verify that the dependencies of `package.json` are licensed in a way that allows their use in a given project.

**Zero dependencies.** Installing this tool adds exactly one package to your project, and nothing else. Runs on macOS, Windows and Linux.

## Why?

Save on legal expenses by ensuring that you can lawfully use all the dependencies in your project.

This will help you to ensure that you are not infringing any copyrights or other intellectual property rights.

Thanks to Licenses Verifier, you will save time and money when, for example, going through a legal due diligence. It will be easier to show that you have the right licenses for all the dependencies in your project by providing to your attorneys the information they need.

## How it works?

Licenses Verifier checks that the dependencies in `package.json` are licensed in a way that allows their use in the current project.

This is done by first listing all the dependencies in `package.json` and then retrieving the licenses of such dependencies. This includes both the development and production licenses, and all of their dependencies (recursively).

These licenses are then checked against the whitelist of licenses that are allowed in the current project. To whitelist a license, add it to the `whitelistedLicenses` array in `package.json`.

Example:

    "whitelistedLicenses": [
        "MIT",
        "Apache-2.0"
    ]

If a dependency is not whitelisted, it will be reported as a problem.

If no whitelist is provided, a warning will be shown.

If any dependency has no license, it will be reported as a problem.

### How the license of a package is determined

In order, Licenses Verifier uses:

1. the `license` field of the package `package.json` (the deprecated `license: { type }` object and `licenses: [...]` array are supported too);
2. failing that, the text of the license file shipped by the package (`LICENSE`, `LICENCE`, `COPYING`, `LICENSE-MIT`, …, in any capitalisation);
3. failing that, the text of the package `README`, but only when the README actually contains the text of a license.

A license identified from a text rather than declared by the package is reported with a `*` suffix, for example `MIT*`. Whitelisting `MIT` also accepts `MIT*`: the whitelist is a decision about the MIT license, not about how the tool found out that a package uses it.

When no license can be determined at all, the package is reported as `UNKNOWN` and the verification fails. A package with no known license grants no rights, so whitelisting `UNKNOWN` does not silence this.

A package that declares a license but ships no copy of its text is reported with a warning, and the text of the same license found in another package is used in the exported data. This is a warning and not a failure: the license is known, it is only its text that is missing.

### Which licenses can I whitelist?

Short answer: ask your lawyers.

Longer answer: you need to verify that the license allows you to use the dependency in your specific project. Many very common licenses, although referred as “open source”, do have specific requirements for use in other projects. Verifying how to comply with those requirements is a matter that should be addressed by a qualified attorney. For this reason, Licenses Verifier does not include any pre-populated license whitelist. Each project may or may not whitelist a license, depending on the project’s characteristics.

For this reason we recommend that you consult with your lawyer before whitelisting a license. You should do so for each project you work on. We strongly suggest not to reuse the same license whitelist in multiple projects without prior consultation with your lawyer.

## How to use it?

### Installation

As a dev dependency of your project (recommended, so that CI uses a pinned version):

    yarn add --dev @akiflow/licenses-verifier

or

    npm install --save-dev @akiflow/licenses-verifier

Globally:

    yarn global add @akiflow/licenses-verifier

### Usage

    yarn licenses-verifier

or, having added `"licenses": "licenses-verifier"` to the `scripts` of your `package.json`:

    yarn licenses

#### Options

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
        the path and name of the file in which a list of all the packages used in the project,
        grouped by license, will be saved. Useful to identify which packages are using which
        licenses. Also accepted as `--outputJsonFile`.

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

#### Exit codes

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
const packages = getLicenses({ projectPath: './', failOnViolation: false })

// The whole verification, including the report printed to stdout.
const result = start({ projectPath: './', failOnViolation: false })
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
- `--outputJsonFile` now works as documented; version 2 only accepted `--json`.
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
