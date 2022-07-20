# Licenses Verifier

Verify that the dependencies of `package.json` are licensed in a way that allows their use in the current project

## Why?

Save on legal expenses by ensuring that you can lawfully use all the dependencies in your project.

This will help you to ensure that you are not infringing any copyrights or other intellectual property rights.

Thanks to Licenses Verifier, you will save you time and money when, for example, going through a legal due diligence. It will be easier to show that you have the right licenses for all the dependencies in your project by providing to your attorneys the information they need.

## How it works?

Licenses Verifier checks that the dependencies in your `package.json` are licensed in a way that allows their use in the current project.

This is done by first listing all the dependencies in your `package.json` and then retrieving the licenses of such dependencies. This includes both the development and production licenses, and all the their dependencies (recursively).

These licenses are then checked against the whitelist of licenses that are allowed in the current project. To whitelist a license, add it to the `whitelistedLicenses` array in the `package.json` file of the project.

Example:

    "whitelistedLicenses": [
        "MIT",
        "Apache-2.0"
    ]

If a dependency is not whitelisted, it will be reported as a problem.

If no whitelist is provided, a warning will be shown.

If any dependency has no license, it will be reported as a problem.

## How to use it?

### Installation

    npm install @akiflow/licenses-verifier --global

or

    yarn add @akiflow/licenses-verifier --global

### Usage

    npm run licenses-verifier

or

    yarn run licenses-verifier

### Options

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

This software is provided 'as-is', without any express or implied warranty. In no event will the authors be held liable for any damages arising from the use of this software.