# Licenses Verifier

Verify that the dependencies of `package.json` are licensed in a way that allows their use in a given project.

## Why?

Save on legal expenses by ensuring that you can lawfully use all the dependencies in your project.

This will help you to ensure that you are not infringing any copyrights or other intellectual property rights.

Thanks to Licenses Verifier, you will save time and money when, for example, going through a legal due diligence. It will be easier to show that you have the right licenses for all the dependencies in your project by providing to your attorneys the information they need.

## How it works?

Licenses Verifier checks that the dependencies in `package.json` are licensed in a way that allows their use in the current project.

This is done by first listing all the dependencies in `package.json` and then retrieving the licenses of such dependencies. This includes both the development and production licenses, and all the their dependencies (recursively).

These licenses are then checked against the whitelist of licenses that are allowed in the current project. To whitelist a license, add it to the `whitelistedLicenses` array in `package.json`.

Example:

    "whitelistedLicenses": [
        "MIT",
        "Apache-2.0"
    ]

If a dependency is not whitelisted, it will be reported as a problem.

If no whitelist is provided, a warning will be shown.

If any dependency has no license, it will be reported as a problem.

### Which licenses can I whitelist?

Short answer: ask your lawyers.

Longer answer: you need to verify that the license allows you to use the dependency in your specific project. Many very common licenses, although referred as “open source”, do have specific requirements for use in other projects. Verifying how to comply with those requirements is a matter that should be addressed by a qualified attorney. For this reason, Licenses Verifier does not include any pre-populated license whitelist. Each project may or may not whitelist a license, depending on the project’s characteristics.

For this reason we recommend that you consult with your lawyer before whitelisting a license. You should do so for each project you work on. We strongly suggest not to reuse the same license whitelist in multiple projects without prior consultation with your lawyer.

## How to use it?

### Installation

    npm install -g @akiflow/licenses-verifier

or

    yarn global add @akiflow/licenses-verifier

### Usage

    npm run licenses-verifier

or

    yarn licenses-verifier

#### Options

All parameters are optional.

    --projectPath=<path>
        If not specified, the current directory will be used.

    --tsOrJsFile=<pathAndFilename>
        the path and name of the file in which all packages and licenses will be made available to be imported in your code. Useful to include links and other information about the dependencies used in your project.
    
    --outLicensesDir=<directory>
        the directory in which the licenses will be saved. A separate file will be created for each license. Useful if you need to provide the licenses to a third party, for example, an attorney to help you review the licenses.

    --outputJsonFile=<pathAndFilename>
        the path and name of the file in which a list of all the packages used in the project, grouped by license, will be saved. Useful to identify which packages are using which licenses.

## Disclaimer

This tool is not intended, and should not be used, as a way to avoid proper legal due diligence. You remain the sole responsible for the use of the packages listed in your dependencies. This software is provided 'as-is', without any express or implied warranty. In no event will the authors be held liable for any damages arising from the use of this software.