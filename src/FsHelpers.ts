import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'

export class FsHelpers {
  public static createDirIfNotExists (path: string): void {
    if (!existsSync(path)) {
      mkdirSync(path, { recursive: true })
    }
  }

  public static writeFileSyncInDir (path: string, fileName: string, content: string): void {
    FsHelpers.createDirIfNotExists(path)
    writeFileSync(join(path, fileName), content)
  }

  public static stringToFolderFilenameAndExtension (str: string): { folder: string, filename: string, extension: string } {
    const folder = str.substring(0, str.lastIndexOf('/'))
    const filename = str.substring(str.lastIndexOf('/') + 1)
    const extension = filename.substring(filename.lastIndexOf('.') + 1)
    return { folder, filename, extension }
  }
}
