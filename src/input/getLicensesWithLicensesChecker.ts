import * as checker from 'license-checker'
 

export interface IModuleInfos {
  [packageName: string]: IModuleInfo
}

export interface IModuleInfo {
  name: string
  licenses: string
  license: string
  notice?: string
  licenseFile?: string
  path?: string
}


export function getLicensesWithLicensesChecker(path: string): Promise<IModuleInfos | null> {
  return new Promise((resolve, reject) => {
    checker.init({
      start: path
    }, function (err: Error, packages) {
      if (err) {
        if (err.message.includes('No packages found in this path')) {
          resolve(null)
        }
        reject(err)
      } else {
        resolve(packages as unknown as IModuleInfos)
      }
    })
  })
}
