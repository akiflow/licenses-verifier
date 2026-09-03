import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs'
import { join, parse } from 'path'

export class FsHelpers {
  public static createDirIfNotExists (path: string): void {
    if (!existsSync(path)) {
      mkdirSync(path, { recursive: true })
    }
  }

  public static writeFileSyncInDir (path: string, fileName: string, content: string): void {
    if (path) {
      FsHelpers.createDirIfNotExists(path)
    }
    writeFileSync(join(path || '.', fileName), content)
  }

  /**
   * Splits a user supplied path into the parts needed to write the file.
   *
   * Uses `path.parse` so that both `a/b/c.json` and `a\b\c.json` are handled,
   * which keeps the CLI arguments portable between macOS/Linux and Windows.
   */
  public static stringToFolderFilenameAndExtension (str: string): { folder: string, filename: string, extension: string } {
    const parsed = parse(str)
    return {
      folder: parsed.dir,
      filename: parsed.base,
      extension: parsed.ext.replace(/^\./, '')
    }
  }

  /** `readdirSync` that returns an empty list instead of throwing. */
  public static readDirSafe (path: string): Array<{ name: string, isDirectory: boolean, isSymbolicLink: boolean }> {
    try {
      return readdirSync(path, { withFileTypes: true }).map(entry => ({
        name: entry.name,
        isDirectory: entry.isDirectory(),
        isSymbolicLink: entry.isSymbolicLink()
      }))
    } catch {
      return []
    }
  }

  /** `readFileSync` that returns null instead of throwing. */
  public static readFileSafe (path: string): string | null {
    try {
      return readFileSync(path, 'utf8')
    } catch {
      return null
    }
  }
}
